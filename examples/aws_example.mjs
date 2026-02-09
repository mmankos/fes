import { scrapeEvents } from "@mmankos/fes";

export const handler = async (event) => {
    try {
        const source_id = event?.source_id || undefined;

        let totalMessages = event?.totalMessages || 0;
        let sourceType = event?.continueFrom?.sourceType;
        const sources = event?.continueFrom
            ? {}
            : {
                eventID: event?.EVENT_ID || [],
                group: event?.GROUP || [],
                page: event?.PAGE || [],
                search_query: event?.SEARCH_QUERY || [],
            };

        // If fresh invocation, determine sourceType from sources
        if (!sourceType) {
            const nonEmpty = Object.entries(sources).find(
                ([_, v]) => v && v.length > 0,
            );
            sourceType = nonEmpty ? nonEmpty[0] : undefined;
        }

        const options = {
            concurrency: parseInt(event?.CONCURRENCY || "5", 10),
            derestrict: event?.DERESTRICT === "true",
            eventsPerSourceLimit: event?.eventsPerSourceLimit || undefined,
            httpReqRetries: parseInt(event?.HTTP_REQ_RETRIES || "5", 10),
            httpReqRetryDelay: parseInt(
                event?.HTTP_REQ_RETRY_DELAY || "1000",
                10,
            ),
            httpReqTimeout: parseInt(event?.HTTP_REQ_TIMEOUT || "5000", 10),
            useProxy: true,
            proxyServer: process.env?.PROXY_SERVER || undefined,
            isAWS: true,
            continueFrom: event?.continueFrom
                ? {
                    postData: event?.continueFrom?.postData,
                    cookies: event?.continueFrom?.cookies,
                    sourceType: event?.continueFrom?.sourceType,
                }
                : undefined,
        };

        const result = await scrapeEvents(sources, options);

        totalMessages = totalMessages + result.events.length;

        console.log(
            `[INFO] Scraped ${result.events.length} events, total: ${totalMessages}`,
        );

        return {
            statusCode: 200,
            hasNextPage: result.hasNextPage,
            nextPostData: result.nextPostData,
            cookies: result.cookies,
            sourceType: sourceType,
            totalMessages: totalMessages,
            source_id: source_id,
        };
    } catch (error) {
        console.error("Pipeline error:", error);

        return {
            statusCode: 500,
            hasNextPage: false,
            totalMessages: event?.totalMessages || 0,
            error: error.message,
        };
    }
};
