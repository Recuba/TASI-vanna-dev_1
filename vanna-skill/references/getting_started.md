# Getting Started with Vanna AI

## Overview

Vanna is a Python framework that converts natural language questions into accurate SQL queries using LLMs (Large Language Models) and Agentic Retrieval. Version 2.0 introduces a complete rewrite focused on user-aware agents and production deployments.

## Installation

### Basic Installation

```bash
pip install vanna
```

### With Specific Integrations

```bash
# Flask + Anthropic Claude
pip install 'vanna[flask,anthropic]'

# FastAPI + OpenAI
pip install 'vanna[fastapi,openai]'

# All integrations
pip install 'vanna[all]'
```

### Requirements

- Python 3.8+
- Database access (PostgreSQL, MySQL, SQLite, etc.)
- LLM API key (OpenAI, Anthropic, etc.) or local Ollama

## Quickstart (30 Seconds)

### 1. Minimal Setup with SQLite

```python
from vanna import Agent
from vanna.integrations.anthropic import AnthropicLlmService
from vanna.integrations.sqlite import SqliteRunner
from vanna.tools import RunSqlTool
from vanna.core.registry import ToolRegistry

# Initialize LLM
llm = AnthropicLlmService(
    model="claude-haiku-4-5",
    api_key="your-api-key"
)

# Set up tools with database
tools = ToolRegistry()
tools.register(RunSqlTool(
    sql_runner=SqliteRunner("./chinook.db")
))

# Create agent
agent = Agent(llm_service=llm, tool_registry=tools)
```

### 2. Add Web Interface

```python
from vanna.servers.fastapi import VannaFastAPIServer

server = VannaFastAPIServer(agent)
server.run(host='0.0.0.0', port=8000)

# Visit http://localhost:8000 for web UI
```

### 3. Embed in Your Frontend

```html
<script src="https://img.vanna.ai/vanna-components.js"></script>
<vanna-chat
  sse-endpoint="http://localhost:8000/api/vanna/v2/chat_sse"
  theme="light">
</vanna-chat>
```

## Production Setup with Authentication

### Full FastAPI Integration

```python
from fastapi import FastAPI
from vanna import Agent
from vanna.servers.fastapi.routes import register_chat_routes
from vanna.servers.base import ChatHandler
from vanna.core.user import UserResolver, User, RequestContext
from vanna.integrations.anthropic import AnthropicLlmService
from vanna.tools import RunSqlTool
from vanna.integrations.postgres import PostgresRunner
from vanna.core.registry import ToolRegistry

app = FastAPI()

# 1. Define user resolver
class MyUserResolver(UserResolver):
    async def resolve_user(self, request_context: RequestContext) -> User:
        token = request_context.get_header('Authorization')
        user_data = self.decode_jwt(token)
        return User(
            id=user_data['id'],
            email=user_data['email'],
            group_memberships=user_data['groups']
        )

# 2. Set up LLM
llm = AnthropicLlmService(model="claude-sonnet-4-5")

# 3. Set up tools
tools = ToolRegistry()
postgres_runner = PostgresRunner(
    host="localhost",
    dbname="mydb",
    user="user",
    password="password",
    port=5432
)
tools.register(RunSqlTool(sql_runner=postgres_runner))

# 4. Create agent
agent = Agent(
    llm_service=llm,
    tool_registry=tools,
    user_resolver=MyUserResolver()
)

# 5. Add routes
chat_handler = ChatHandler(agent)
register_chat_routes(app, chat_handler)

# Run: uvicorn main:app --host 0.0.0.0 --port 8000
```

## What You Get

When you ask a question, Vanna returns:

1. **Streaming Progress Updates** - Real-time status
2. **SQL Code Block** - Generated query (admin only by default)
3. **Interactive Data Table** - Results in table format
4. **Charts** - Plotly visualizations
5. **Natural Language Summary** - Human-readable explanation

All streamed in real-time via Server-Sent Events.

## Key Features

- **User-Aware**: Identity flows through every layer
- **Streaming**: Real-time responses via SSE
- **Row-Level Security**: Filter queries per user permissions
- **Audit Logging**: Track all queries per user
- **Multi-LLM Support**: OpenAI, Anthropic, Ollama, Azure, Gemini, Bedrock, Mistral
- **Multi-Database Support**: PostgreSQL, MySQL, SQLite, Snowflake, BigQuery, DuckDB, ClickHouse
- **Built-in Web UI**: `<vanna-chat>` component
- **Custom Tools**: Extend with your own functionality

## Next Steps

1. Read `architecture.md` for system design
2. See `database_integrations.md` for your database
3. See `llm_integrations.md` for your LLM provider
4. Check `migration.md` if upgrading from 0.x
