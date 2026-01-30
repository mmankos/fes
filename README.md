# fes - Facebook Event Scraper
A Facebook event scraper that is AWS Lambda compatible and extracts events via both HTML-embedded data and the GraphQL API to capture all the events.

[![Watch the video](https://raw.githubusercontent.com/mmankos/fes/main/examples/thumbnail.png)](https://raw.githubusercontent.com/mmankos/fes/main/examples/video.mp4)

## ⚠️ Important Notice
When using this package to scrape Facebook events:
- Always respect the [robots.txt](https://en.wikipedia.org/wiki/Robots.txt) rules of the [target website](https://www.facebook.com/robots.txt).
- Only scrape data you are authorized to access.
- Excessive or unauthorized scraping may violate Facebook's terms of service.
- Use the `concurrency` option responsibly to avoid overloading servers.

## Instalation
```
npm install @mmankos/fes
```

## Local Usage
```
import { scrapeEvents } from "@mmankos/fes";

const sources = {
	eventID: ["1234567890", "0987654321"], // scrape specific events
	group: ["group1", "group2"], // scrape events from these Facebook groups
	page: ["page1", "page2", "page3"], // scrape events from these Facebook pages
	search_query: ["keyword1_1 keyword1_2", "keyword2"], // scrape events by keywords
};

// Optional scraping options (defaults provided)
const options = {
	concurrency: 10, // max parallel requests
    eventsPerSourceLimit: undefined, // max amount of events to scrape per source
	httpReqRetries: 5, // retry failed requests
	httpReqRetryDelay: 1000, // wait 1s between retries
	httpReqTimeout: 5000, // timeout each HTTP request after 5s
	isAWS: true, // if true abide by the rules set by AWS Lambda (max one puppeteer browser instance at a time)
	outputFile: "events.json", // optionally save results to file
	useProxy: true, // if true, routes traffic through the local Tailscale SOCKS5 proxy (localhost:1055)
};

const scrapedEvents = await scrapeEvents(sources, options);
console.dir(scrapedEvents, { depth: null });
console.log(`TOTAL SCRAPED EVENTS: ${scrapedEvents.length}`);
```

---

## AWS ECR Setup
```
$ aws login
$ aws ecr get-login-password --region YOUR_AWS_REGION | docker login --username AWS --password-stdin YOUR_AWS_ACCOUNT_ID.dkr.ecr.YOUR_AWS_REGION.amazonaws.com
$ aws ecr create-repository --repository-name YOUR_ECR_NAME
$ docker build --no-cache -f Dockerfile -t YOUR_ECR_NAME:latest .
$ docker tag YOUR_ECR_NAME:latest YOUR_AWS_ACCOUNT_ID.dkr.ecr.YOUR_AWS_REGION.amazonaws.com/YOUR_ECR_NAME:latest
$ docker push YOUR_AWS_ACCOUNT_ID.dkr.ecr.YOUR_AWS_REGION.amazonaws.com/YOUR_ECR_NAME:latest
```

## AWS Lambda Setup
1. **Lambda** -> **Create function**
2. Choose **Container image**
3. Name the function
4. Enter the **Container image URI**
5. Runtime: **Node.js 22.x**
6. Architecture: **x86_64**
7. **Create function**

## AWS Lambda Configuration
1. On the **Image** screen click on **Edit** in the **Image configuration** section
2. Set the CMD override to **index.handler** or **src/main.handler** based on where your **handler function** is located
3. In **General configuration** set **Memory** to 1024MB or 1600MB preferably and
**Timeout** to a reasonable value based on the number of sources to scrape plus
some headroom (~1 minute per 100 events).
4. In **Environment variables** add **TAILSCALE_AUTHKEY** variable with the key you generated in the **Tailscale admin app** as the value
4. In **Environment variables** add **EXIT_NODE** variable with the **IP address** of the exit node that you have configured in the **Tailscale admin app** as the value

## TODO
- [X] Make AWS Lambda compatible
- [X] Proxy support (Single Tailscale Exit Node)
- [X] Dockerize
