import { SourceTypes, UrlModifiers } from "./constants.mjs";

export const constructUrl = (sourceType, source) => {
	if (sourceType === SourceTypes.EventID) {
		return UrlModifiers.EventPrefix + source;
	} else if (sourceType === SourceTypes.Group) {
		return UrlModifiers.GroupPrefix + source + UrlModifiers.GroupPostfix;
	} else if (sourceType === SourceTypes.Page) {
		return UrlModifiers.PagePrefix + source + UrlModifiers.PagePostfix;
	} else if (sourceType === SourceTypes.SearchQuery) {
		return UrlModifiers.SearchQueryPrefix + source;
	}
};

export const disableCursor = () => {
	process.stdout.write("\x1B[?25l");
};

export const enableCursor = () => {
	process.stdout.write("\x1B[?25h");
};

export const extractJson = (str, key, shouldContain) => {
	const results = [];
	let searchPos = 0;

	while (true) {
		const start = str.indexOf(`"${key}":`, searchPos);
		if (start === -1) {
			break;
		}

		const pos = start + key.length + 3;
		const brace = str[pos];
		if (brace !== "{" && brace !== "[") {
			searchPos = pos + 1;
			continue;
		}
		let level = 1;
		let i = pos + 1;

		while (i < str.length && level > 0) {
			if (str[i] === brace) {
				level++;
			} else if (str[i] === (brace === "{" ? "}" : "]")) {
				level--;
			}
			i++;
		}

		if (level !== 0) break;
		searchPos = i;

		try {
			const parsed = JSON.parse(str.slice(pos, i));
			if (!shouldContain) return parsed;

			if (
				parsed &&
				typeof parsed === "object" &&
				shouldContain in parsed
			) {
				return parsed;
			}

			results.push(parsed);
		} catch (_err) {
			return null;
		}
	}

	// if shouldContain was defined but not found, return first match
	return results.length ? results[0] : null;
};

export const setDifference = (setA, setB) => {
	return new Set([...setA].filter((x) => !setB.has(x)));
};

export const replaceParamValue = (encodedString, key, newValue) => {
	const regex = new RegExp(`(${key}%22%3A%22)[^%]*(%22%2C%22)`, "g");
	return encodedString.replace(regex, `$1${newValue}$2`);
};

export const logError = (error) => {
	process.stdout.write("\r");
	console.log(error);
};

export class Spinner {
	constructor() {
		this.spinnerSteps = ["-", "\\", "|", "/"];

		this.currentIndex = 0;
	}

	step() {
		process.stdout.write(
			`\rscraping ${this.spinnerSteps[this.currentIndex]}`,
		);
		this.currentIndex = (this.currentIndex + 1) % this.spinnerSteps.length;
	}

	finish() {
		process.stdout.write("\n");
	}
}
