import { execFileSync } from "child_process";

import { WebDriverAgent } from "./webdriver-agent.js";
import { ActionableError, Button, InstalledApp, Robot, ScreenElement, ScreenSize, SwipeDirection } from "./robot.js";

export interface Simulator {
	name: string;
	uuid: string;
	state: string;
}

interface ListDevicesResponse {
	devices: {
		[key: string]: Array<{
			state: string;
			name: string;
			isAvailable: boolean;
			udid: string;
		}>,
	},
}

interface AppInfo {
	ApplicationType: string;
	Bundle: string;
	CFBundleDisplayName: string;
	CFBundleExecutable: string;
	CFBundleIdentifier: string;
	CFBundleName: string;
	CFBundleVersion: string;
	DataContainer: string;
	Path: string;
}

const TIMEOUT = 30000;
const WDA_PORT = 8100;
const MAX_BUFFER_SIZE = 1024 * 1024 * 4;

export class Simctl implements Robot {

	constructor(private readonly simulatorUuid: string) {}

	private async wda(): Promise<WebDriverAgent> {
		const wda = new WebDriverAgent("localhost", WDA_PORT);

		if (!(await wda.isRunning())) {
			throw new ActionableError("WebDriverAgent is not running on device (tunnel okay, port forwarding okay), please see https://github.com/mobile-next/mobile-mcp/wiki/");
		}

		return wda;
	}

	private simctl(...args: string[]): Buffer {
		return execFileSync(
			"xcrun",
			["simctl", ...args],
			{
				timeout: TIMEOUT,
				maxBuffer: MAX_BUFFER_SIZE,
			}
		);
	}

	public async getScreenshot(): Promise<Buffer> {
		return this.simctl("io", this.simulatorUuid, "screenshot", "-");
	}

	public async openUrl(url: string) {
		const wda = await this.wda();
		await wda.openUrl(url);
		// alternative: this.simctl("openurl", this.simulatorUuid, url);
	}

	public async launchApp(packageName: string) {
		this.simctl("launch", this.simulatorUuid, packageName);
	}

	public async terminateApp(packageName: string) {
		this.simctl("terminate", this.simulatorUuid, packageName);
	}

	private parseIOSAppData(inputText: string): Array<AppInfo> {
		const result: Array<AppInfo> = [];

		// Remove leading and trailing characters if needed
		const cleanText = inputText.trim();

		// Extract each app section
		const appRegex = /"([^"]+)"\s+=\s+\{([^}]+)\};/g;
		let appMatch;

		while ((appMatch = appRegex.exec(cleanText)) !== null) {
			// const bundleId = appMatch[1];
			const appContent = appMatch[2];

			const appInfo: Partial<AppInfo> = {
			};

			// parse simple key-value pairs
			const keyValueRegex = /\s+(\w+)\s+=\s+([^;]+);/g;
			let keyValueMatch;

			while ((keyValueMatch = keyValueRegex.exec(appContent)) !== null) {
				const key = keyValueMatch[1];
				let value = keyValueMatch[2].trim();

				// Handle quoted string values
				if (value.startsWith('"') && value.endsWith('"')) {
					value = value.substring(1, value.length - 1);
				}

				if (key !== "GroupContainers" && key !== "SBAppTags") {
					(appInfo as any)[key] = value;
				}
			}

			result.push(appInfo as AppInfo);
		}

		return result;
	}

	public async listApps(): Promise<InstalledApp[]> {
		const text = this.simctl("listapps", this.simulatorUuid).toString();
		const apps = this.parseIOSAppData(text);
		return apps.map(app => ({
			packageName: app.CFBundleIdentifier,
			appName: app.CFBundleDisplayName,
		}));
	}

	public async getScreenSize(): Promise<ScreenSize> {
		const wda = await this.wda();
		return wda.getScreenSize();
	}

	public async sendKeys(keys: string) {
		const wda = await this.wda();
		return wda.sendKeys(keys);
	}

	public async swipe(direction: SwipeDirection) {
		const wda = await this.wda();
		return wda.swipe(direction);
	}

	public async tap(x: number, y: number) {
		const wda = await this.wda();
		return wda.tap(x, y);
	}

	public async pressButton(button: Button) {
		const wda = await this.wda();
		return wda.pressButton(button);
	}

	public async getElementsOnScreen(): Promise<ScreenElement[]> {
		const wda = await this.wda();
		return wda.getElementsOnScreen();
	}
}

export class SimctlManager {

	public listSimulators(): Simulator[] {
		const text = execFileSync("xcrun", ["simctl", "list", "devices", "-j"]).toString();
		const json: ListDevicesResponse = JSON.parse(text);
		return Object.values(json.devices).flatMap(device => {
			return device.map(d => {
				return {
					name: d.name,
					uuid: d.udid,
					state: d.state,
				};
			});
		});
	}

	public listBootedSimulators(): Simulator[] {
		return this.listSimulators()
			.filter(simulator => simulator.state === "Booted");
	}

	public getSimulator(uuid: string): Simctl {
		return new Simctl(uuid);
	}
}
