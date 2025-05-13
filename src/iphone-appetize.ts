import { Button, InstalledApp, Robot, ScreenElement, ScreenSize, SwipeDirection } from "./robot.js";
import { sendRequestToClient } from "./appetize/aptzserver.js";
import { error, trace } from "./logger.js";
import axios from "axios";


const appetizeToken = "Basic dG9rX3ZxY2ZwemFyNTJ5M3R3emluamloZXhod3JtOg==";

export interface AppetizeIosSimulator {
    name: string;
    type: string;
}

export class AppetizeRobot implements Robot {

    constructor(private readonly clientId: string) {
        this.clientId = clientId;
    }

    public async startSession(): Promise<void> {
        return sendRequestToClient(this.clientId, "startSession", {});
    }

    public async getScreenSize(): Promise<ScreenSize> {
        return sendRequestToClient(this.clientId, "getScreenSize", {});
    }

    public async swipe(direction: SwipeDirection): Promise<void> {
        return sendRequestToClient(this.clientId, "swipe", { direction });
    }

    public async getScreenshot(): Promise<Buffer> {
        return sendRequestToClient(this.clientId, "getScreenshot", {})
        .then((data: { screenshot: string }) => {
            const cleanBase64 = data.screenshot.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(cleanBase64, 'base64');
            return buffer;
        });
    }

    public async listApps(): Promise<InstalledApp[]> {
        return new Promise(async (resolve, reject) => {
            try {
                const response = await axios.get('https://api.appetize.io/v1/apps', {
                    headers: {
                        "Authorization": appetizeToken,
                        "Accept": "*/*"
                    },
                });
    
                if (!response.status.toString().startsWith("2")) {
                    // Handle non-2xx responses
                    return reject(new Error(`Error: ${response.statusText}`));
                }
                const apps = response.data.map((app: { name: any; bundle: any; }) => ({
                    appName: app.name,
                    packageName: app.bundle,
                }));
                trace('Installed apps:' + apps);
                resolve(apps); // Resolve with the fetched data
                
            } catch (error) {
                console.error('Error fetching installed apps:', error);
                reject(error); // Reject the promise with the error
            }
        });
    }

    public async launchApp(packageName: string): Promise<void> {
        return sendRequestToClient(this.clientId, "launchApp", { packageName }).then(() => {});
    }

    public async terminateApp(packageName: string): Promise<void> {
        return sendRequestToClient(this.clientId, "terminateApp", { packageName }).then(() => {});
    }

    public async openUrl(url: string): Promise<void> {
        return sendRequestToClient(this.clientId, "openUrl", { url }).then(() => {});
    }

    public async sendKeys(text: string): Promise<void> {
        return sendRequestToClient(this.clientId, "sendKeys", { text }).then(() => {});
    }

    public async pressButton(button: Button): Promise<void> {
        return sendRequestToClient(this.clientId, "pressButton", { button }).then(() => {});
    }

    public async tap(x: number, y: number): Promise<void> {
        return sendRequestToClient(this.clientId, "tap", { coordinates: { x, y } }).then(() => {});
    }

    public async getElementsOnScreen(): Promise<ScreenElement[]> {
        return sendRequestToClient(this.clientId, "getElementsOnScreen", {})
        .then((data: { elements: any[] }) => {
            const elements = data.elements;
            if (elements.length > 0) {
                const out = this.filterNodes(elements[0]);
                return out;
            } else {
                return [];
            }
        });
    }

    private filterNodes(source: any): Array<ScreenElement> {
        const output: ScreenElement[] = [];
    
        // Define accepted types for filtering
        const acceptedTypes = ["UILabel", "_D_FrontPage.RoundView", "_D_FrontPage.StyledLabel", "UIButton", "UIImageView"];
        const acceptedBaseTypes = ["UILabel", "UIAccessibilityContainerView", "UIButton", "UIImageView", "UIControl"];

        const validBounds = source.bounds && source.bounds.width > 0 && source.bounds.height > 0;
        const worthyType = acceptedBaseTypes.includes(source.attributes?.class) || 
            (acceptedBaseTypes.includes(source.attributes?.baseClass) && source.attributes?.userInteractionEnabled);
    
        // Check if the current node matches the accepted types
        if (worthyType) {
            if (validBounds) {
                output.push({
                    type: source.attributes.class,
                    label: source.attributes.accessibilityLabel || source.attributes.text || null,
                    name: source.attributes.name || null,
                    value: source.attributes.value || null,
                    rect: {
                        x: source.bounds.x,
                        y: source.bounds.y,
                        width: source.bounds.width,
                        height: source.bounds.height,
                    },
                });
            }
        }
    
        // Recursively process child nodes
        if (source.children) {
            for (const child of source.children) {
                output.push(...this.filterNodes(child));
            }
        }
    
        return output;
    }

}

export class AppetizeManager {

    constructor(private readonly clientId: string) {
        this.clientId = clientId;
    }

    public createAppetizeSimulator(): AppetizeRobot {
        return new AppetizeRobot(this.clientId);
    }


}