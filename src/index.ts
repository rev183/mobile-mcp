#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server.js";
import { error } from "./logger.js";
import { startAppetizeHttpServer, stopAppetizeHttpServer } from "./appetize/aptzserver.js";

async function startMcpServer() {
    const transport = new StdioServerTransport();
    const server = createMcpServer();
    await server.connect(transport);
    error("mobile-mcp server running on stdio");
}

async function main() {
	return await Promise.all([
		startAppetizeHttpServer(),
		startMcpServer(),
	]);
}

const shutdown = () => {
	stopAppetizeHttpServer().then(() => {
		process.exit(0);
	})
};

process.on('SIGINT', shutdown); // Handle Ctrl+C
process.on('SIGTERM', shutdown); // Handle termination signal

main().catch(err => {
	console.error("Fatal error in main():", err);
	error("Fatal error in main(): " + JSON.stringify(err.stack));
	process.exit(1);
});
