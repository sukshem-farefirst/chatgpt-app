// app/api/mcp/hello.ts

export async function GET() {
  return Response.json({
    message: 'FareFirst MCP Server is running!',
    endpoints: {
      mcp: '/api/mcp',
      cards: '/api/mcp/cards',
      flights: '/api/flights'
    }
  });
}