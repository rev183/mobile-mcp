// Description: Core functions for controlling appetize simulator.

const appetizeIframeName = '#appetize';
const device = "iphone15pro";
const urlParams = new URLSearchParams(window.location.search);
const clientId = urlParams.get('clientId');
const publicKey = "b_xkj4knpj7iftqygfexapjm6ewe";
let websocket;

// Init Functions
function initWebSocket(socketUrl, onMessageCallback) {
    // socketUrl = socketUrl || `wss://localhost:8080`;
    websocket = new WebSocket(socketUrl);
    websocket.onopen = (event) => { // Explicitly typed as (event: Event) => any
        console.log("WebSocket connection opened", event);
        if (clientId) {
            // Send the client ID to the server upon connection
            websocket.send(JSON.stringify({ type: 'register_client', clientId: clientId }));
        } else {
            console.error("Client ID not available to send to server.");
        }
    };

    websocket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.action) {
            handleServerMessage(data); 
        } else {
            console.log("Received message from server:", JSON.stringify(event));
        }
    };

    websocket.onclose = (event) => { 
        console.log("WebSocket connection closed", event);
    };

    websocket.onerror = (event) => { 
        console.error("WebSocket error:", event);
    };
}

function sendMessageToServer(message) {
    console.log('Sending message to server:', message);
    if (websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify(message));
    } else {
        console.error("WebSocket is not open. Cannot send message:", message);
    }
}

async function handleServerMessage(message) {
    console.log('Message from server:', message);
    // Handle the message from the server
    if (!window.client) {
        sendResponse('error', message.action, message.request_id, undefined, { message: "Client not active" } );
        return;
    }
    if (!window.session) {
        if (message.action !== 'startSession') {
            sendResponse('error', message.action, message.request_id, undefined, { message: "Session not started" } );
            return;
        } else {
            try {
                window.session = await window.client.startSession();
                sendResponse('response', message.action, message.request_id, { status: 'success' });
            } catch (error) {
                console.error("Failed to start session", error);
                sendResponse('error', message.action, message.request_id, undefined, { message: error.message, stack: error.stack } );
            } finally {
                return;
            }
        }
    }
    try {

        // Helper function to send responses
        function sendResponse(type, action, requestId, payload, error) {
            const response = {
                type: type,
                action: action,
                requestId: requestId,
                payload,
                error
            };
            sendMessageToServer(response);
        }

        // Check the type of action in the message
        switch (message.action) {
            case 'getScreenSize':
                try {
                    let screen = window.client.device.screen;
                    console.log(`Getting screen size for device: ${device}`);
                    sendResponse('response', 'getScreenSize', message.request_id, { width: screen.width, height: screen.height, scale: screen.devicePixelRatio });
                } catch (error) {
                    console.error('Error getting screen size:', error);
                    sendResponse('error', 'getScreenSize', message.request_id, undefined, { message: error.message, stack: error.stack } );
                }
                break;

            case 'swipe':
                let { element, position, coordinates, direction } = message.payload;
                let action;
                try {
                    // handle different actions
                    
                    if (element) {
                        action = { element, gesture: direction }
                    } else if (position) {
                        action = { position, gesture: direction }
                    } else if (coordinates) {
                        action = { position, gesture: direction }
                    }
                    // Execute the swipe action
                    await window.session.swipe(action);
                    
                    sendResponse('response', 'swipe', message.request_id, { status: 'success' });
                } catch (error) {
                    console.error(`Failed to swipe with action ${action}:`, error);
                    throw error;
                }
                appHandler.swipe(message.direction).then(() => {
                    console.log(`Swipe completed in direction: ${message.direction}`);
                    
                }).catch(error => {
                    console.error("Swipe failed", error);
                    sendResponse('error', 'swipe', message.request_id, undefined, { message: error.message, stack: error.stack } );
                });
                break;

            case 'getScreenshot':
                console.log('Capturing screenshot...');
                try {
                    // Simulate a screenshot capture (in a real case, it would depend on the environment)
                    const { data, mimeType } = await session.screenshot('base64');
                    console.log('Screenshot captured:', data);
                    sendResponse('binary1', 'getScreenshot', message.request_id, { screenshot: data });
                } catch (error) {
                    sendResponse('error', 'getScreenshot', message.request_id, undefined, { message: error.message, stack: error.stack } );
                    console.log(`Capturing screenshot error: ${error}`);
                }
                break;
            case 'launchApp':
                try {
                    const { packageName } = message.payload;
                    await window.session.launchApp(packageName);
                    console.log(`Launched app: ${JSON.stringify(message.payload)}`);
                    sendResponse('response', 'launchApp', message.request_id, { status: 'success' });
                } catch (error) {
                    console.error("Launch App failed", error);
                    sendResponse('error', 'launchApp', message.request_id, undefined, { message: error.message, stack: error.stack } );
                }
                break;

            case 'terminateApp':
                try {
                    const { packageName } = message.payload;
                    await window.session.end();
                    console.log(`Terminated app: ${packageName}`);
                    sendResponse('response', 'terminateApp', message.request_id, { status: 'success' });
                } catch (error) {
                    console.error("Terminate App Failed", error);
                    sendResponse('error', 'terminateApp', message.request_id, undefined, { message: error.message, stack: error.stack } );
                }
                break;

            case 'openUrl':
                try {
                    const { url } = message.payload;
                    await window.session.openUrl(url);
                    console.log(`Opened URL: ${message.url}`);
                    sendResponse('response', 'openUrl', message.request_id, { status: 'success' });
                } catch (error) {
                    console.error("Open URL failed", error);
                    sendResponse('error', 'openUrl', message.request_id, undefined, { message: error.message, stack: error.stack } );
                }
                break;

            case 'sendKeys':
                try {
                    const { text } = message.payload;
                    await window.session.type(text);
                    console.log(`Sent keys: ${text}`);
                    sendResponse('response', 'sendKeys', message.request_id, { status: 'success' });
                } catch (error) {
                    console.error("Send Keys Failed", error);
                    sendResponse('error', 'sendKeys', message.request_id, undefined, { message: error.message, stack: error.stack } );
                }
                break;

            case 'pressButton':
                try {
                    const { button } = message.payload;
                    await window.session.keypress(button);
                    console.log(`Pressed button: ${button}`);
                    sendResponse('response', 'pressButton', message.request_id, { status: 'success' });
                } catch (error) {
                    console.error("Press Button Failed", error);
                    sendResponse('error', 'pressButton', message.request_id, undefined, { message: error.message, stack: error.stack } );
                }
                break;

            case 'tap':
                try {
                    const tapInfo = message.payload;
                    console.log(`Tapping with info: ${tapInfo}`);
                    await session.tap(tapInfo)
                    console.log(`Tapped at screen with tapInfo: ${tapInfo}`);
                    sendResponse('response', 'tap', message.request_id, { status: 'success' });
                }
                catch (error) {
                    console.error("Tap failed", error);
                    sendResponse('error', 'tap', message.request_id, undefined, { message: error.message, stack: error.stack } );
                }
                break;

            case 'getElementsOnScreen':
                try {
                    const ui = await window.session.getUI()
                    console.log('Elements on screen:', ui);
                    sendResponse('response', 'getElementsOnScreen', message.request_id, { elements: ui });
                } catch (error) {
                    console.error("Get Elements on Screen failed", error);
                    sendResponse('error', 'getElementsOnScreen', message.request_id, undefined, { message: error.message, stack: error.stack } );
                }
                break;

            default:
                console.log('Unknown action type', message);
                sendResponse('error', 'unknown', message.request_id, { error: { message: 'Unknown action: ' + message.action } });
                break;
        }
    } catch (error) {
        console.error('Error handling server message:', error, message);
        sendResponse('error', 'message_processing_error', message.request_id, undefined, { message: error.message, stack: error.stack } );
    }
}

/**
 * Initializes animations for the page.
 */
function initAnimations() {
    AOS.init({
        easing: 'ease-out-cubic', once: true, offset: 120, duration: 650
    });
}

/**
 * Initializes the client and adds the session event listener.
 * @returns {Promise<void>} A promise that resolves when the client is loaded.
 */
async function initClient() {
    try {
        console.log(`Loading client for ${appetizeIframeName}`);
        const iFrame = document.querySelector(appetizeIframeName);
        // iFrame.src = `https://appetize.io/embed/${publicKey}?device=${device}&toast=top&scale=auto&centered=both&autoplay=true`;
        let client = await window.appetize.getClient(appetizeIframeName, {
            publicKey: publicKey,
            device: device,
            toast: 'top',
            scale: 'auto',
            centered: 'both',
            autoplay: false,
        });
        window.client = client;
        console.log('client loaded!');
        const session = await client.startSession();
        window.session = session;
        window.client.on("session", async session => {
            console.log('session started!')
            try {
                window.session = session;
                // await runCustomActions(session);
            } catch (error) {
                console.error(error);
            }
        })
        initWebSocket();
    } catch (error) {
        console.error(error);
    }
}

/**
 * Updates the session with the selected app.
 * @returns {Promise<void>} A promise that resolves when the client exists.
 */
async function updateSession() {
    const iFrame = document.querySelector(appetizeIframeName);

    const newUrl = `https://appetize.io/embed/${publicKey}?device=${device}&toast=${toast}&scale=auto&centered=both&autoplay=${autoPlay}`;

    console.log(`Updating session with ${selectedApp.publicKey}`);
    iFrame.src = newUrl;

    // Wait for the iframe to have a src before initializing client. If we already have a client, don't init again.
    if (window.client) {
        return
    }
    await initClient();
}

// On Page Load

document.addEventListener("DOMContentLoaded", async function () {
    initAnimations();
    await initClient()
});