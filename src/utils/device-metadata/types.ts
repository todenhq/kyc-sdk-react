// Shape of the device metadata the web SDK collects, plus the navigator
// extensions it reads. Split out of the collector per the 200-line rule.

export const SDK_TYPE = 'web' as const;

// Single source of truth for the SDK version — also used by services/api.ts
// for the X-SDK-Version header.
//
// The RELEASE pins this: sync-react-sdk.yml rewrites it from the tag before
// publishing, and fails the release if it cannot. It used to say "keep in sync
// with package.json", which nothing enforced -- 2.12.0 shipped reporting
// 2.11.0. Treat the value here as a development default, not the released one.
export const SDK_VERSION = '3.6.0';

export interface WebDeviceMetadata {
	sdkType: 'web';
	sdkVersion: string;
	sdkPlatform: 'web';
	capturedAt: string;

	device: {
		type: 'mobile' | 'tablet' | 'desktop' | 'unknown';
		vendor?: string;
		model?: string;
	};
	os: {
		name: string;
		version?: string;
	};
	browser: {
		name: string;
		version?: string;
		engine?: string;
	};
	screen?: {
		width: number;
		height: number;
		availWidth?: number;
		availHeight?: number;
		devicePixelRatio: number;
		colorDepth?: number;
		orientation?: string;
	};
	viewport?: {
		width: number;
		height: number;
	};
	locale?: string;
	language?: string;
	languages?: string[];
	timezone?: string;
	timezoneOffsetMinutes?: number;
	hardware?: {
		cores?: number;
		memoryGb?: number;
		touchPoints?: number;
	};
	network?: {
		type?: string;
		downlinkMbps?: number;
		rttMs?: number;
		saveData?: boolean;
	};
	capabilities?: {
		cookies?: boolean;
		doNotTrack?: boolean;
		online?: boolean;
		webdriver?: boolean;
	};
	userAgent?: string;
	platform?: string;
}

export interface NetworkInformation {
	effectiveType?: string;
	downlink?: number;
	rtt?: number;
	saveData?: boolean;
}

export interface NavigatorWithExtras extends Navigator {
	deviceMemory?: number;
	connection?: NetworkInformation;
	mozConnection?: NetworkInformation;
	webkitConnection?: NetworkInformation;
	userAgentData?: {
		brands?: { brand: string; version: string }[];
		mobile?: boolean;
		platform?: string;
		getHighEntropyValues?: (hints: string[]) => Promise<{
			model?: string;
			platformVersion?: string;
		}>;
	};
}
