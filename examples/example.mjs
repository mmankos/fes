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
    useProxy: false, // if true, routes traffic through the local Tailscale SOCKS5 proxy (localhost:1055)
};

const scrapedEvents = await scrapeEvents(sources, options);
console.log(`TOTAL SCRAPED EVENTS: ${scrapedEvents.length}`);
//console.dir(scrapedEvents, { depth: null });
