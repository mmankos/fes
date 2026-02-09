import fs from "node:fs";
import pLimit from "p-limit";
import { graphQLScrapeEvents } from "./scrapers/graphQLScraper.mjs";
import {
    htmlScrapeEventByID,
    htmlScrapeEvents,
} from "./scrapers/htmlScraper.mjs";
import { SourceTypes } from "./utils/constants.mjs";
import {
    constructUrl,
    disableCursor,
    enableCursor,
    logError,
    Spinner,
} from "./utils/utils.mjs";

/**
 * Scrape Facebook events from multiple optional input sources.
 *
 * @param {Object} sourceTypes - Defines which types of sources to scrape.
 * @param {string[]} [sourceTypes.eventID=[]] - Array of specific Facebook event IDs to scrape directly.
 * @param {string[]} [sourceTypes.group=[]] - Array of Facebook group IDs to scrape events from.
 * @param {string[]} [sourceTypes.page=[]] - Array of Facebook page IDs to scrape events from.
 * @param {string[]} [sourceTypes.search_query=[]] - Array of search query strings to find events by keyword.
 *
 * @param {Object} [options] - Optional scraping configuration.
 * @param {number} [options.concurrency=10] - Maximum number of async tasks to run in parallel.
 * @param {Object} [options.continueFrom] - Continue from a previous pagination state (skips Puppeteer).
 * @param {string} [options.continueFrom.postData] - The postData from a previous scrapeEvents call.
 * @param {string} [options.continueFrom.cookies] - The cookies from a previous scrapeEvents call.
 * @param {string} [options.continueFrom.sourceType] - The sourceType (group, page, search_query).
 * @param {boolean} [options.derestrict=false] - If true, bypasses scraping restrictions (use responsibly).
 * @param {number} [options.eventsPerSourceLimit=10] - Maximum number of events to be scraped per source, unlimited if undefined.
 * @param {number} [options.httpReqRetries=5] - Maximum number of retry attempts per request.
 * @param {number} [options.httpReqRetryDelay=1000] - Delay (in milliseconds) between retry attempts after a failed request.
 * @param {number} [options.httpReqTimeout=5000] - Timeout (in milliseconds) for each HTTP request before it is aborted.
 * @param {boolean} [options.isAWS=true] - If true, only one source is allowed and only one pagination iteration runs.
 * @param {string} [options.outputFile] - Optional file path to save the scraped events as JSON.
 * @param {string} [options.proxyServer] - SOCKS5 proxy server URL (e.g., "socks5://bore.pub:12345").
 * @param {boolean} [options.useProxy=true] - If true, routes traffic through the configured SOCKS5 proxy.
 *
 * @returns {Promise<{events: Array, hasNextPage: boolean, nextPostData: string|null, cookies: string|null}>}
 *          Returns scraped events and pagination info for chaining Lambda invocations.
 */
export const scrapeEvents = async (
    sourceTypes = { eventID: [], group: [], page: [], search_query: [] },
    options = {
        concurrency: 10,
        continueFrom: undefined,
        derestrict: false,
        eventsPerSourceLimit: undefined,
        httpReqRetries: 5,
        httpReqRetryDelay: 1000,
        httpReqTimeout: 5000,
        isAWS: true,
        outputFile: undefined,
        proxyServer: undefined,
        useProxy: true,
    },
) => {
    try {
        disableCursor();

        Object.assign(options, {
            concurrency: options.concurrency ?? 10,
            continueFrom: options.continueFrom ?? undefined,
            derestrict: options.derestrict ?? false,
            eventsPerSourceLimit: options.eventsPerSourceLimit ?? undefined,
            httpReqRetries: options.httpReqRetries ?? 5,
            httpReqRetryDelay: options.httpReqRetryDelay ?? 1000,
            httpReqTimeout: options.httpReqTimeout ?? 5000,
            isAWS: options.isAWS ?? true,
            outputFile: options.outputFile ?? undefined,
            proxyServer: options.proxyServer ?? undefined,
            useProxy: options.useProxy ?? true,
        });

        const events = [];
        const eventIDs = new Set();
        const standaloneEventIDs = new Set();
        const sourceLimit = pLimit(options.concurrency);
        // only one puppeteer-core browser launch at a time on AWS Lambda is allowed
        const graphQLLimit = pLimit(options.isAWS ? 1 : options.concurrency);
        const spinner = new Spinner();

        let paginationInfo = {
            hasNextPage: false,
            nextPostData: null,
            cookies: null,
        };

        if (options.isAWS) {
            // Check if this is a continuation from a previous invocation
            if (
                options?.continueFrom?.postData &&
                options?.continueFrom?.cookies &&
                options?.continueFrom?.sourceType
            ) {
                console.log(
                    "[DEBUG] AWS continuation mode: using provided postData and cookies",
                );
                paginationInfo = await graphQLScrapeEvents(
                    options.continueFrom.postData,
                    options.continueFrom.cookies,
                    "",
                    options.continueFrom.sourceType,
                    events,
                    eventIDs,
                    options,
                    spinner,
                );
            } else {
                // Fresh scrape - validate single source
                const nonEmptySources = Object.entries(sourceTypes).filter(
                    ([_, sources]) => sources && sources.length > 0,
                );

                if (nonEmptySources.length === 0) {
                    throw new Error(
                        "AWS Lambda mode requires at least one source",
                    );
                }

                if (nonEmptySources.length > 1) {
                    throw new Error(
                        `AWS Lambda mode only supports one sourceType, got ${nonEmptySources.length}: ${nonEmptySources.map(([type]) => type).join(", ")}`,
                    );
                }

                const [sourceType, sources] = nonEmptySources[0];

                if (sources.length > 1) {
                    throw new Error(
                        `AWS Lambda mode only supports one source per sourceType, got ${sources.length} sources for ${sourceType}`,
                    );
                }

                const source = sources[0];
                const url = constructUrl(sourceType, source);

                if (sourceType === SourceTypes.EventID) {
                    standaloneEventIDs.add(source);
                    await htmlScrapeEventByID(
                        { standaloneEventIDs },
                        events,
                        eventIDs,
                        options,
                        spinner,
                    );
                } else {
                    const hasNextPage = await htmlScrapeEvents(
                        url,
                        sourceType,
                        events,
                        eventIDs,
                        options,
                        spinner,
                    );

                    if (hasNextPage) {
                        paginationInfo = await graphQLScrapeEvents(
                            null,
                            null,
                            url,
                            sourceType,
                            events,
                            eventIDs,
                            options,
                            spinner,
                        );
                    }
                }
            }
        } else {
            const tasks = Object.entries(sourceTypes).flatMap(
                ([sourceType, sources]) => {
                    if (sourceType === SourceTypes.EventID) {
                        sources.forEach((id) => {
                            standaloneEventIDs.add(id);
                        });
                        return htmlScrapeEventByID(
                            { standaloneEventIDs },
                            events,
                            eventIDs,
                            options,
                            spinner,
                        );
                    }
                    return sources.map((source) =>
                        sourceLimit(async () => {
                            const url = constructUrl(sourceType, source);
                            const hasNextPage = await htmlScrapeEvents(
                                url,
                                sourceType,
                                events,
                                eventIDs,
                                options,
                                spinner,
                            );

                            if (
                                sourceType !== SourceTypes.EventID &&
                                hasNextPage
                            ) {
                                await graphQLLimit(() =>
                                    graphQLScrapeEvents(
                                        null,
                                        null,
                                        url,
                                        sourceType,
                                        events,
                                        eventIDs,
                                        options,
                                        spinner,
                                    ),
                                );
                            }
                        }),
                    );
                },
            );

            await Promise.all(tasks);
        }

        if (options.outputFile) {
            try {
                await fs.promises.writeFile(
                    options.outputFile,
                    JSON.stringify(events, null, 2),
                    "utf8",
                );
            } catch (err) {
                logError(err);
            }
        }

        spinner.finish();
        enableCursor();

        return {
            events,
            hasNextPage: paginationInfo.hasNextPage,
            nextPostData: paginationInfo.nextPostData,
            cookies: paginationInfo.cookies,
        };
    } catch (err) {
        enableCursor();
        logError(err);

        throw err;
    }
};
