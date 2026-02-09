import chromium from "@sparticuz/chromium";
import axios from "axios";
import puppeteer from "puppeteer-core";
import { SocksProxyAgent } from "socks-proxy-agent";
import { PageElements, SourceTypes } from "../utils/constants.mjs";
import { logError, replaceParamValue } from "../utils/utils.mjs";
import { htmlScrapeEventByID } from "./htmlScraper.mjs";

const launchBrowser = async (url, options) => {
    const puppeteerArgs = [
        ...chromium.args,
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--single-process",
        "--no-zygote",
    ];

    if (options.useProxy && options.proxyServer) {
        puppeteerArgs.push(`--proxy-server=${options.proxyServer}`);
    }

    const browser = await puppeteer.launch({
        args: puppeteerArgs,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
    });
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });

    // Log public IP to verify proxy is working
    try {
        await page.goto("https://ifconfig.me/ip", {
            waitUntil: "networkidle0",
            timeout: 10000,
        });
        const publicIP = await page.evaluate(() =>
            document.body.innerText.trim(),
        );
        console.log("[DEBUG] Public IP through proxy:", publicIP);
    } catch (e) {
        console.log("[DEBUG] Could not check public IP:", e.message);
    }

    await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
    return { browser, page };
};

const handleDialogWindows = async (page, delayMs) => {
    await (await page.$(PageElements.DeclineCookies))?.click();
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await page.click("body", { force: true });
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await page.keyboard.press("Escape");
};

const waitForGraphQLRequest = (page) => {
    return new Promise((resolve) => {
        page.on("request", (request) => {
            const url = request.url();
            if (url.includes("/api/graphql") || url.includes("graphql?")) {
                resolve(request);
            }
        });
    });
};

const scrollUntilGraphQL = async (
    page,
    graphqlPromise,
    delayMs,
    maxScrolls,
) => {
    let lastScrollHeight = 0;
    for (let i = 0; i < maxScrolls; i++) {
        const currentScrollHeight = await page.evaluate(() => {
            window.scrollBy(0, 1000);
            return document.body.scrollHeight;
        });

        await new Promise((resolve) => setTimeout(resolve, delayMs));

        if (currentScrollHeight === lastScrollHeight) {
            return null;
        }

        lastScrollHeight = currentScrollHeight;

        // Check if GraphQL request occurred
        const race = await Promise.race([
            graphqlPromise,
            new Promise((resolve) => setTimeout(() => resolve(null), delayMs)),
        ]);

        if (race) return race;
    }

    return null;
};

const getCookies = async (page) => {
    const cookies = await page.cookies();
    return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
};

export const graphQLPostRequest = async (postData, cookies, options) => {
    // Create SOCKS proxy agent if proxy is configured
    const axiosConfig = {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0",
            Cookie: cookies,
        },
        timeout: options.httpReqTimeout,
    };

    if (options.useProxy && options.proxyServer) {
        const agent = new SocksProxyAgent(options.proxyServer);
        axiosConfig.httpAgent = agent;
        axiosConfig.httpsAgent = agent;
    }

    for (let attempt = 1; attempt <= options.httpReqRetries; attempt++) {
        try {
            const response = await axios.post(
                "https://www.facebook.com/api/graphql/",
                postData,
                axiosConfig,
            );

            const edges = response.data?.data?.serpResponse?.results?.edges;
            if (edges && edges.length === 0) {
                return undefined;
            }

            return response.data.data;
        } catch (_err) {
            if (attempt < options.httpReqRetries) {
                await new Promise((resolve) =>
                    setTimeout(resolve, options.httpReqRetryDelay),
                );
            } else {
                logError(
                    `\ngraphQLPostRequest failed with response:\n ${_err}\n`,
                );
                return undefined;
            }
        }
    }
};

export const captureGraphQL = async (url, sourceType, options) => {
    const delayMs = 100;
    const maxScrolls = 20;

    const { browser, page } = await launchBrowser(url, options);
    await handleDialogWindows(page, delayMs);

    const graphqlPromise = waitForGraphQLRequest(page);

    if (sourceType === SourceTypes.Group) {
        await (await page.$(PageElements.GroupSeeMoreEvents))?.click();
    }

    const graphqlRequest = await scrollUntilGraphQL(
        page,
        graphqlPromise,
        delayMs,
        maxScrolls,
    );

    let postData = null;
    let cookies = null;

    if (graphqlRequest) {
        postData = graphqlRequest.postData();
        cookies = await getCookies(page);
        console.log("[DEBUG] Captured GraphQL request");
    } else {
        console.log("[DEBUG] No GraphQL request captured after scrolling");
        // Try to get page content for debugging
        const pageContent = await page.content();
        if (
            pageContent.includes("You must log in") ||
            pageContent.includes("Log in")
        ) {
            console.log("[DEBUG] Page requires login");
        }
        if (
            pageContent.includes("blocked") ||
            pageContent.includes("suspicious")
        ) {
            console.log("[DEBUG] Page may be blocked");
        }
        console.log("[DEBUG] Page URL:", page.url());
    }

    await browser.close();

    return { postData, cookies };
};

export const graphQLScrapeEvents = async (
    postData,
    cookies,
    url,
    sourceType,
    events,
    eventIDs,
    options,
    spinner,
) => {
    const promises = [];

    // If postData/cookies provided, use them (continuation mode)
    // Otherwise, capture fresh from browser
    if (postData && cookies) {
        console.log("[DEBUG] graphQLScrapeEvents: using provided postData and cookies (continuation)");
    } else {
        console.log("[DEBUG] Starting captureGraphQL for URL:", url);
        ({ postData, cookies } = await captureGraphQL(
            url,
            sourceType,
            options,
        ));
    }
    let hasNextPage = true;
    let idExtractor;

    if (!postData) {
        console.log(
            "[DEBUG] postData is null, skipping graphQL scraping for this source",
        );
        return { hasNextPage: false, nextPostData: null, cookies: null };
    }
    console.log("[DEBUG] postData captured, proceeding with pagination");

    while (hasNextPage) {
        if (
            options.eventsPerSourceLimit &&
            events.length >= options.eventsPerSourceLimit
        ) {
            break;
        }

        let nodes = [];
        let endCursor = "";
        const data = await graphQLPostRequest(postData, cookies, options);

        if (sourceType === SourceTypes.Group) {
            nodes = data?.node?.upcoming_events?.edges || [];
            hasNextPage =
                data?.node?.upcoming_events?.page_info?.has_next_page || false;
            endCursor =
                data?.node?.upcoming_events?.page_info?.end_cursor || "";
            idExtractor = (node) => node.node.id;
        } else if (sourceType === SourceTypes.Page) {
            nodes = data?.node?.pageItems?.edges || [];
            hasNextPage =
                data?.node?.pageItems?.page_info?.has_next_page || false;
            endCursor = data?.node?.pageItems?.page_info?.end_cursor || "";
            idExtractor = (node) => node.node.node.id;
        } else if (sourceType === SourceTypes.SearchQuery) {
            nodes = data?.serpResponse?.results?.edges || [];
            hasNextPage =
                data?.serpResponse?.results?.page_info?.has_next_page || false;
            endCursor =
                data?.serpResponse?.results?.page_info?.end_cursor || "";
            idExtractor = (node) =>
                node.rendering_strategy.view_model.profile.id;
        }

        const promise = htmlScrapeEventByID(
            { nodes, idExtractor },
            events,
            eventIDs,
            options,
            spinner,
        );

        promises.push(options.derestrict ? promise : await promise);

        postData = replaceParamValue(postData, "cursor", endCursor);

        if (options.isAWS) {
            await Promise.all(promises);
            return {
                hasNextPage,
                nextPostData: hasNextPage ? postData : null,
                cookies: hasNextPage ? cookies : null,
            };
        }
    }

    await Promise.all(promises);
    return { hasNextPage: false, nextPostData: null, cookies: null };
};
