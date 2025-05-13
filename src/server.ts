import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { z, ZodRawShape, ZodTypeAny } from "zod";
import sharp from "sharp";
import { v4 as uuidv4 } from 'uuid';

import { error, trace } from "./logger.js";
import { AndroidRobot, getConnectedDevices } from "./android.js";
import { ActionableError, Robot } from "./robot.js";
import { SimctlManager } from "./iphone-simulator.js";
import { IosManager, IosRobot } from "./ios.js";
import { exec } from "node:child_process";
import { AppetizeManager } from "./iphone-appetize.js";

// const getAgentVersion = (): string => {
// 	const version = process.env.VERSION as string;
// 	return version;
// };

export const createMcpServer = (): McpServer => {

	const server = new McpServer({
		name: "mobile-mcp",
		version: '0.1',
		capabilities: {
			resources: {},
			tools: {},
		},
	});

	const tool = (name: string, description: string, paramsSchema: ZodRawShape, cb: (args: z.objectOutputType<ZodRawShape, ZodTypeAny>) => Promise<string>) => {
		const wrappedCb = async (args: ZodRawShape): Promise<CallToolResult> => {
			try {
				trace(`Invoking ${name} with args: ${JSON.stringify(args)}`);
				const response = await cb(args);
				trace(`=> ${response}`);
				return {
					content: [{ type: "text", text: response }],
				};
			} catch (error: any) {
				if (error instanceof ActionableError) {
					return {
						content: [{ type: "text", text: `${error.message}. Please fix the issue and try again.` }],
					};
				} else {
					// a real exception
					trace(`Tool '${description}' failed: ${error.message} stack: ${error.stack}`);
					return {
						content: [{ type: "text", text: `Error: ${error.message}` }],
						isError: true,
					};
				}
			}
		};

		server.tool(name, description, paramsSchema, args => wrappedCb(args));
	};

	let robot: Robot | null;
	const simulatorManager = new SimctlManager();
	let appetizeManager: AppetizeManager | null;

	const requireRobot = () => {
		if (!robot) {
			throw new ActionableError("No device selected. Use the mobile_use_device tool to select a device.");
		}
	};

	const requireAppetizeManager = () => {
		if (!appetizeManager) {
			throw new ActionableError("No Appetize simulator selected. Use the create_appetize_simulator tool to create a simulator.");
		}
	};

	tool(
		"mobile_list_available_devices",
		"List all available devices. This includes both physical devices and simulators. If there is more than one device returned, you need to let the user select one of them.",
		{},
		async ({}) => {
			const iosManager = new IosManager();
			const devices = await simulatorManager.listBootedSimulators();
			const simulatorNames = devices.map(d => d.name);
			const androidDevices = getConnectedDevices();
			const iosDevices = await iosManager.listDevices();
			return `Found these iOS simulators: [${simulatorNames.join(".")}], iOS devices: [${iosDevices.join(",")}] and Android devices: [${androidDevices.join(",")}]`;
		}
	);

	server.tool(
        "create_appetize_simulator",
        "When no devices are available, create a new Appetize simulator and use it. This will open a URL in Chrome with a clientId parameter. The clientId is a UUID that is used to identify the simulator.",
        {},
        async ({}) => {
            try {
                // Step 1: Generate a unique clientId (UUID)
                const clientId = uuidv4();
                // console.log("Generated clientId:", clientId);

                // Step 2: Create the URL with the clientId
                const url = `http://localhost:8080/launch.html?clientId=${clientId}`;
                // console.log("Opening URL:", url);

                // Step 3: Open the URL in Chrome (using child_process to run system command)
                let command: string;

                if (process.platform === 'win32') {
                    // Windows command to open Chrome
                    command = `start chrome "${url}"`;
                } else if (process.platform === 'darwin') {
                    // macOS command to open Chrome
                    command = `open -a "Google Chrome" "${url}"`;
                } else {
                    // Linux command to open Chrome
                    command = `google-chrome "${url}"`; // Replace 'google-chrome' with 'chromium' if necessary
                }

                exec(command, (error, stdout, stderr) => {
                    if (error) {
                        // console.error(`exec error: ${error}`);
                        return {
                            content: [{ type: "text", text: `Error: ${error.message}` }],
                            isError: true,
                        };
                    }

                    if (stderr) {
                        // console.error(`stderr: ${stderr}`);
                    }

                    // console.log(`stdout: ${stdout}`);
                    return {
                        content: [{ type: "text", text: `Successfully opened URL with clientId: ${clientId}` }],
                    };
                });

                // Step 4: Use the clientId to instantiate AppetizeManager (example logic)
                appetizeManager = new AppetizeManager(clientId);
                const simulator = appetizeManager.createAppetizeSimulator();
                // console.log("Appetize Simulator created:", simulator);

                return {
                    content: [{ type: "text", text: `Launched URL with clientId ${clientId} and simulator created.` }],
                };
            } catch (error: any) {
                // console.error("Error in open_url_in_chrome_with_client_id:", error);
                return {
                    content: [{ type: "text", text: `Error: ${error.message}` }],
                    isError: true,
                };
            }
        }
    );

	tool(
		"mobile_use_device",
		"Select a device to use. This can be a simulator or an Android device. Use the list_available_devices tool to get a list of available devices.",
		{
			device: z.string().describe("The name of the device to select"),
			deviceType: z.enum(["simulator", "ios", "android", "appetize-ios"]).describe("The type of device to select"),
		},
		async ({ device, deviceType }) => {
			switch (deviceType) {
				case "simulator":
					robot = simulatorManager.getSimulator(device);
					break;
				case "ios":
					robot = new IosRobot(device);
					break;
				case "android":
					robot = new AndroidRobot(device);
					break;
				case "appetize-ios":
					requireAppetizeManager();
					robot = appetizeManager!.createAppetizeSimulator();
					break
			}

			return `Selected device: ${device} (${deviceType})`;
		}
	);

	tool(
		"mobile_list_apps",
		"List all the installed apps on the device",
		{},
		async ({}) => {
			requireRobot();
			const result = await robot!.listApps();
			return `Found these apps on device: ${result.map(app => `${app.appName} (${app.packageName})`).join(", ")}`;
		}
	);

	tool(
		"mobile_launch_app",
		"Launch an app on mobile device. Use this to open a specific app. You can find the package name of the app by calling list_apps_on_device.",
		{
			packageName: z.string().describe("The package name of the app to launch"),
		},
		async ({ packageName }) => {
			requireRobot();
			await robot!.launchApp(packageName);
			return `Launched app ${packageName}`;
		}
	);

	tool(
		"mobile_terminate_app",
		"Stop and terminate an app on mobile device",
		{
			packageName: z.string().describe("The package name of the app to terminate"),
		},
		async ({ packageName }) => {
			requireRobot();
			await robot!.terminateApp(packageName);
			return `Terminated app ${packageName}`;
		}
	);

	tool(
		"mobile_get_screen_size",
		"Get the screen size of the mobile device in pixels",
		{},
		async ({}) => {
			requireRobot();
			const screenSize = await robot!.getScreenSize();
			return `Screen size is ${screenSize.width}x${screenSize.height} pixels`;
		}
	);

	tool(
		"mobile_click_on_screen_at_coordinates",
		"Click on the screen at given x,y coordinates",
		{
			x: z.number().describe("The x coordinate to click on the screen, in pixels"),
			y: z.number().describe("The y coordinate to click on the screen, in pixels"),
		},
		async ({ x, y }) => {
			requireRobot();
			await robot!.tap(x, y);
			return `Clicked on screen at coordinates: ${x}, ${y}`;
		}
	);

	tool(
		"mobile_list_elements_on_screen",
		"List elements on screen and their coordinates, with display text or accessibility label. Do not cache this result.",
		{
		},
		async ({}) => {
			requireRobot();
			const elements = await robot!.getElementsOnScreen();

			const result = elements.map(element => {
				const x = Number((element.rect.x + element.rect.width / 2)).toFixed(3);
				const y = Number((element.rect.y + element.rect.height / 2)).toFixed(3);

				return {
					text: element.label,
					coordinates: { x, y }
				};
			});

			return `Found these elements on screen: ${JSON.stringify(result)}`;
		}
	);

	tool(
		"mobile_press_button",
		"Press a button on device",
		{
			button: z.string().describe("The button to press. Supported buttons: BACK (android only), HOME, VOLUME_UP, VOLUME_DOWN, ENTER"),
		},
		async ({ button }) => {
			requireRobot();
			await robot!.pressButton(button);
			return `Pressed the button: ${button}`;
		}
	);

	tool(
		"mobile_open_url",
		"Open a URL in browser on device",
		{
			url: z.string().describe("The URL to open"),
		},
		async ({ url }) => {
			requireRobot();
			await robot!.openUrl(url);
			return `Opened URL: ${url}`;
		}
	);

	tool(
		"swipe_on_screen",
		"Swipe on the screen",
		{
			direction: z.enum(["up", "down"]).describe("The direction to swipe"),
		},
		async ({ direction }) => {
			requireRobot();
			await robot!.swipe(direction);
			return `Swiped ${direction} on screen`;
		}
	);

	tool(
		"mobile_type_keys",
		"Type text into the focused element",
		{
			text: z.string().describe("The text to type"),
			submit: z.boolean().describe("Whether to submit the text. If true, the text will be submitted as if the user pressed the enter key."),
		},
		async ({ text, submit }) => {
			requireRobot();
			await robot!.sendKeys(text);

			if (submit) {
				await robot!.pressButton("ENTER");
			}

			return `Typed text: ${text}`;
		}
	);

	server.tool(
		"mobile_take_screenshot",
		"Take a screenshot of the mobile device. Use this to understand what's on screen, if you need to press an element that is available through view hierarchy then you must list elements on screen instead. Do not cache this result.",
		{},
		async ({}) => {
			requireRobot();

			try {
				const screenshot = await robot!.getScreenshot();

				// Scale down the screenshot by 50%
				const image = sharp(screenshot);
				const metadata = await image.metadata();
				if (!metadata.width) {
					throw new Error("Failed to get screenshot metadata");
				}

				const resizedScreenshot = await image
					.resize(Math.floor(metadata.width / 2))
					.jpeg({ quality: 75 })
					.toBuffer();

				// debug:
				// writeFileSync('/tmp/screenshot.png', screenshot);
				// writeFileSync('/tmp/screenshot-scaled.jpg', resizedScreenshot);

				const screenshot64 = resizedScreenshot.toString("base64");
				trace(`Screenshot taken: ${screenshot.length} bytes`);

				return {
					content: [{ type: "image", data: screenshot64, mimeType: "image/jpeg" }]
				};
			} catch (err: any) {
				error(`Error taking screenshot: ${err}`);
				return {
					content: [{ type: "text", text: `Error: ${err}` }],
					isError: true,
				};
			}
		}
	);

	return server;
};
