import { scrapeEvents } from "@mmankos/fes";

const sources = {
    search_query: ["kosice"],
};

// Optional scraping options (defaults provided)
const options = {
    concurrency: 10, // max parallel requests
    eventsPerSourceLimit: undefined, // max amount of events to scrape per source
    httpReqRetries: 5, // retry failed requests
    httpReqRetryDelay: 1000, // wait 1s between retries
    httpReqTimeout: 5000, // timeout each HTTP request after 5s
    isAWS: false, // if true abide by the rules set by AWS Lambda (max one puppeteer browser instance at a time)
    outputFile: "events.json", // optionally save results to file
    proxyServer: undefined, // socks5 server address to route traffic through
    useProxy: false, // if true, and proxyServer option is set traffic is routed through the socks5 proxy
};

const scrapedEvents = await scrapeEvents(sources, options);
console.log(`TOTAL SCRAPED EVENTS: ${scrapedEvents.length}`);
//console.dir(scrapedEvents, { depth: null });
