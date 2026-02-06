---
name: vanna
description: Vanna AI - Text-to-SQL generation using LLMs and Agentic Retrieval. Use when working with natural language to SQL queries, database querying via chat, training AI on database schemas, or building text-to-SQL applications.
---

# Vanna AI - Text-to-SQL with LLMs

Vanna is a Python framework for generating accurate SQL queries from natural language using LLMs and Agentic Retrieval. It's ideal for building chat-with-your-database applications with enterprise security features.

## When to Use This Skill

This skill should be activated when:
- Converting natural language questions to SQL queries
- Building text-to-SQL applications with streaming responses
- Implementing user-aware database querying with row-level security
- Creating chat interfaces for database analytics
- Integrating LLM-powered SQL generation with existing authentication systems
- Training AI models on database schemas and query patterns
- Working with the Vanna Python framework
- Debugging Vanna agent configurations
- Setting up Vanna with various databases (PostgreSQL, MySQL, Snowflake, BigQuery, etc.)
- Configuring LLM providers for Vanna (Anthropic, OpenAI, Ollama, etc.)

## Quick Start

### Installation

```bash
# Basic installation
pip install vanna

# With specific integrations
pip install 'vanna[flask,anthropic]'
pip install 'vanna[fastapi,openai]'
```

### Minimal Example (30 seconds)

```python
from vanna import Agent
from vanna.integrations.anthropic import AnthropicLlmService
from vanna.integrations.sqlite import SqliteRunner
from vanna.tools import RunSqlTool
from vanna.core.registry import ToolRegistry

# Set up agent with SQLite
llm = AnthropicLlmService(model="claude-haiku-4-5")
tools = ToolRegistry()
tools.register(RunSqlTool(sql_runner=SqliteRunner("./chinook.db")))

agent = Agent(llm_service=llm, tool_registry=tools)
```

### Production Setup with Authentication

```python
from fastapi import FastAPI
from vanna import Agent
from vanna.servers.fastapi.routes import register_chat_routes
from vanna.servers.base import ChatHandler
from vanna.core.user import UserResolver, User, RequestContext
from vanna.integrations.anthropic import AnthropicLlmService
from vanna.tools import RunSqlTool
from vanna.integrations.sqlite import SqliteRunner
from vanna.core.registry import ToolRegistry

app = FastAPI()

# Define user resolver for your auth system
class MyUserResolver(UserResolver):
    async def resolve_user(self, request_context: RequestContext) -> User:
        token = request_context.get_header('Authorization')
        user_data = self.decode_jwt(token)
        return User(
            id=user_data['id'],
            email=user_data['email'],
            group_memberships=user_data['groups']
        )

# Set up agent with tools
llm = AnthropicLlmService(model="claude-sonnet-4-5")
tools = ToolRegistry()
tools.register(RunSqlTool(sql_runner=SqliteRunner("./data.db")))

agent = Agent(
    llm_service=llm,
    tool_registry=tools,
    user_resolver=MyUserResolver()
)

# Add Vanna routes
chat_handler = ChatHandler(agent)
register_chat_routes(app, chat_handler)
```

### Web Component (Frontend)

```html
<!-- Drop into any webpage -->
<script src="https://img.vanna.ai/vanna-components.js"></script>
<vanna-chat
  sse-endpoint="https://your-api.com/chat"
  theme="dark">
</vanna-chat>
```

---

## Core Concepts

### Architecture Overview

```text
User Question -> Web Component -> Server -> Agent -> Tools -> Database
                                    |
                              User Resolver (auth)
                                    |
                              LLM Service
```

**Key Components:**
1. **Agent** - Orchestrates LLM and tools to answer questions
2. **UserResolver** - Extracts user identity from requests (JWT, cookies)
3. **ToolRegistry** - Manages available tools (SQL, memory, custom)
4. **LlmService** - Handles LLM interactions (OpenAI, Anthropic, etc.)
5. **SqlRunner** - Executes SQL against your database

### User-Aware Design

Every component knows the user identity for:
- Row-level security (filter queries per user permissions)
- Audit logging (track all queries per user)
- Rate limiting (per-user quotas)
- Permission checks (tool access control)

---

## Database Integrations

### PostgreSQL

```python
from vanna.integrations.postgres import PostgresRunner

runner = PostgresRunner(
    host="localhost",
    dbname="mydb",
    user="user",
    password="password",
    port=5432
)
tools.register(RunSqlTool(sql_runner=runner))
```

### MySQL

```python
from vanna.integrations.mysql import MySQLRunner

runner = MySQLRunner(
    host="localhost",
    database="mydb",
    user="user",
    password="password"
)
```

### SQLite

```python
from vanna.integrations.sqlite import SqliteRunner

runner = SqliteRunner("./database.db")
```

### Snowflake

```python
from vanna.integrations.snowflake import SnowflakeRunner

runner = SnowflakeRunner(
    account="xxx.snowflakecomputing.com",
    user="user",
    password="password",
    database="DB",
    schema="PUBLIC",
    warehouse="COMPUTE_WH"
)
```

### BigQuery

```python
from vanna.integrations.bigquery import BigQueryRunner

runner = BigQueryRunner(
    project="my-project",
    credentials_path="./credentials.json"
)
```

### DuckDB

```python
from vanna.integrations.duckdb import DuckDBRunner

runner = DuckDBRunner("./analytics.duckdb")
```

### ClickHouse

```python
from vanna.integrations.clickhouse import ClickHouseRunner

runner = ClickHouseRunner(
    host="localhost",
    database="default",
    user="default",
    password=""
)
```

---

## LLM Integrations

### Anthropic Claude

```python
from vanna.integrations.anthropic import AnthropicLlmService

llm = AnthropicLlmService(
    model="claude-sonnet-4-5",  # or claude-haiku-4-5, claude-opus-4-5
    api_key="sk-ant-..."
)
```

### OpenAI

```python
from vanna.integrations.openai import OpenAILlmService

llm = OpenAILlmService(
    model="gpt-4o",
    api_key="sk-..."
)
```

### Azure OpenAI

```python
from vanna.integrations.azure import AzureOpenAILlmService

llm = AzureOpenAILlmService(
    deployment_name="gpt-4",
    azure_endpoint="https://xxx.openai.azure.com/",
    api_key="..."
)
```

### Ollama (Local)

```python
from vanna.integrations.ollama import OllamaLlmService

llm = OllamaLlmService(
    model="llama3",
    base_url="http://localhost:11434"
)
```

### Google Gemini

```python
from vanna.integrations.gemini import GeminiLlmService

llm = GeminiLlmService(
    model="gemini-pro",
    api_key="..."
)
```

### AWS Bedrock

```python
from vanna.integrations.bedrock import BedrockLlmService

llm = BedrockLlmService(
    model_id="anthropic.claude-3-sonnet-20240229-v1:0",
    region_name="us-east-1"
)
```

### Mistral

```python
from vanna.integrations.mistral import MistralLlmService

llm = MistralLlmService(
    model="mistral-large-latest",
    api_key="..."
)
```

---

## Custom Tools

Create domain-specific tools by extending the `Tool` base class:

```python
from vanna.core.tool import Tool, ToolContext, ToolResult
from pydantic import BaseModel, Field
from typing import Type

class EmailArgs(BaseModel):
    recipient: str = Field(description="Email recipient")
    subject: str = Field(description="Email subject")

class EmailTool(Tool[EmailArgs]):
    @property
    def name(self) -> str:
        return "send_email"

    @property
    def access_groups(self) -> list[str]:
        return ["send_email"]  # Permission check

    def get_args_schema(self) -> Type[EmailArgs]:
        return EmailArgs

    async def execute(self, context: ToolContext, args: EmailArgs) -> ToolResult:
        user = context.user  # Automatically injected

        await self.email_service.send(
            from_email=user.email,
            to=args.recipient,
            subject=args.subject
        )

        return ToolResult(success=True, result_for_llm=f"Email sent to {args.recipient}")

# Register
tools.register(EmailTool())
```

---

## Web Server Setup

### FastAPI Server

```python
from vanna.servers.fastapi import VannaFastAPIServer

server = VannaFastAPIServer(agent)
app = server.create_app()

# Run with: uvicorn main:app --host 0.0.0.0 --port 8000
```

### Flask Server

```python
from vanna.servers.flask import VannaFlaskServer

server = VannaFlaskServer(agent)
app = server.create_app()

# Run with: flask run --host 0.0.0.0 --port 8000
```

### Add to Existing FastAPI App

```python
from vanna.servers.fastapi.routes import register_chat_routes
from vanna.servers.base import ChatHandler

# Your existing app
app = FastAPI()

# Add Vanna routes
chat_handler = ChatHandler(agent)
register_chat_routes(app, chat_handler)

# Endpoints added:
# - POST /api/vanna/v2/chat_sse (streaming)
# - GET / (optional web UI)
```

---

## Enterprise Features

### Lifecycle Hooks

```python
from vanna import AgentConfig

async def quota_hook(context):
    user = context.user
    if await check_quota_exceeded(user.id):
        raise QuotaExceededError("Daily limit reached")

config = AgentConfig(
    pre_execution_hooks=[quota_hook]
)
agent = Agent(llm_service=llm, tool_registry=tools, config=config)
```

### Audit Logging

```python
from vanna.core.audit import AuditLogger

class MyAuditLogger(AuditLogger):
    async def log_query(self, user_id: str, query: str, sql: str, result: any):
        await self.db.insert("audit_log", {
            "user_id": user_id,
            "query": query,
            "sql": sql,
            "timestamp": datetime.now()
        })

agent = Agent(..., audit_logger=MyAuditLogger())
```

### Rate Limiting

```python
async def rate_limit_hook(context):
    user = context.user
    requests = await get_request_count(user.id, period="1h")
    if requests > 100:
        raise RateLimitError("Too many requests")

config = AgentConfig(pre_execution_hooks=[rate_limit_hook])
```

### Row-Level Security

```python
class SecureSqlRunner(PostgresRunner):
    async def execute(self, sql: str, user: User) -> DataFrame:
        # Inject user filter into queries
        filtered_sql = self.apply_rls(sql, user.group_memberships)
        return await super().execute(filtered_sql, user)
```

---

## Migration from Vanna 0.x

### Quick Migration with Legacy Adapter

```python
# Wrap existing VannaBase instance
from vanna.legacy.adapter import LegacyVannaAdapter

# Your existing 0.x setup
# vn = MyVanna(config={'model': 'gpt-4'})
# vn.connect_to_postgres(...)
# vn.train(ddl="...")

# Wrap with adapter
tools = LegacyVannaAdapter(vn)

# Create new agent
llm = AnthropicLlmService(model="claude-haiku-4-5")
agent = Agent(llm_service=llm, tool_registry=tools, user_resolver=SimpleUserResolver())

# Run server
server = VannaFastAPIServer(agent)
server.run(host='0.0.0.0', port=8000)
```

### Key Differences from 0.x

| Feature | Vanna 0.x | Vanna 2.0+ |
|---------|-----------|------------|
| User Context | None | User object flows through system |
| Interaction | `vn.ask()` | Agent-based with streaming |
| Tools | Monolithic methods | Modular Tool classes |
| Responses | Text/DataFrames | Rich UI components |
| Training | `vn.train()` | System prompts, RAG tools |
| Database | `vn.connect_to_*()` | SqlRunner implementations |
| Web UI | Custom | Built-in `<vanna-chat>` |
| Streaming | None | SSE by default |
| Permissions | None | Group-based access control |

---

## Streaming Responses

Vanna 2.0 streams rich UI components via Server-Sent Events:

1. **Progress Updates** - Real-time status
2. **SQL Code Block** - Generated query (admin only by default)
3. **Data Table** - Interactive results
4. **Charts** - Plotly visualizations
5. **Summary** - Natural language explanation

All rendered beautifully by the `<vanna-chat>` component.

---

## Common Patterns

### Multi-Tenant SaaS

```python
class TenantAwareUserResolver(UserResolver):
    async def resolve_user(self, ctx: RequestContext) -> User:
        token = ctx.get_header('Authorization')
        user = decode_jwt(token)
        return User(
            id=user['id'],
            email=user['email'],
            group_memberships=[f"tenant_{user['tenant_id']}"],
            metadata={'tenant_id': user['tenant_id']}
        )
```

### RAG with Documentation

```python
from vanna.tools import SearchDocsTool

tools.register(SearchDocsTool(
    vector_store=my_vector_store,
    access_groups=['user', 'admin']
))
```

### Conversation History

```python
from vanna.core.storage import ConversationStorage

storage = PostgresConversationStorage(connection_string)
agent = Agent(..., conversation_storage=storage)
```

---

## Troubleshooting

### Agent not generating SQL
- Check tool registration: `print(tools.list_tools())`
- Verify database connection in SqlRunner
- Check user has access to `run_sql` tool group

### Authentication errors
- Verify UserResolver extracts correct token
- Check group_memberships match tool access_groups
- Enable debug logging: `logging.basicConfig(level=logging.DEBUG)`

### Streaming not working
- Ensure `AgentConfig(stream_responses=True)`
- Check SSE endpoint URL in `<vanna-chat>`
- Verify CORS settings allow streaming

---

## Reference Documentation

For detailed API documentation and advanced topics, see:
- `references/getting_started.md` - Installation and quickstart
- `references/architecture.md` - System design and components
- `references/database_integrations.md` - All database connectors
- `references/llm_integrations.md` - All LLM providers
- `references/tools.md` - Custom tool development
- `references/web_ui.md` - Frontend component guide
- `references/migration.md` - 0.x to 2.0 migration guide
- `references/enterprise.md` - Security and audit features

---

## Resources

- **Documentation**: https://vanna.ai/docs
- **GitHub**: https://github.com/vanna-ai/vanna
- **Discussions**: https://github.com/vanna-ai/vanna/discussions
- **Issues**: https://github.com/vanna-ai/vanna/issues
- **Enterprise Support**: support@vanna.ai

---

## Quick Copy-Paste Patterns

### Complete FastAPI Setup

```python
from fastapi import FastAPI
from vanna import Agent, AgentConfig
from vanna.servers.fastapi.routes import register_chat_routes
from vanna.servers.base import ChatHandler
from vanna.core.user import UserResolver, User, RequestContext
from vanna.integrations.anthropic import AnthropicLlmService
from vanna.integrations.postgres import PostgresRunner
from vanna.tools import RunSqlTool
from vanna.core.registry import ToolRegistry

app = FastAPI()

class MyUserResolver(UserResolver):
    async def resolve_user(self, ctx: RequestContext) -> User:
        token = ctx.get_header('Authorization')
        user_data = self.decode_jwt(token)
        return User(
            id=user_data['id'],
            email=user_data['email'],
            group_memberships=user_data.get('groups', ['user'])
        )

llm = AnthropicLlmService(model="claude-sonnet-4-5", api_key="sk-ant-...")
tools = ToolRegistry()
tools.register(RunSqlTool(sql_runner=PostgresRunner(
    host="localhost", dbname="mydb", user="user", password="pass", port=5432
)))

agent = Agent(
    llm_service=llm,
    tool_registry=tools,
    user_resolver=MyUserResolver(),
    config=AgentConfig(stream_responses=True)
)

register_chat_routes(app, ChatHandler(agent))
# Run: uvicorn main:app --host 0.0.0.0 --port 8000
```

### Simple SQLite Demo

```python
from vanna import Agent
from vanna.integrations.anthropic import AnthropicLlmService
from vanna.integrations.sqlite import SqliteRunner
from vanna.tools import RunSqlTool
from vanna.core.registry import ToolRegistry
from vanna.servers.fastapi import VannaFastAPIServer

llm = AnthropicLlmService(model="claude-haiku-4-5", api_key="sk-ant-...")
tools = ToolRegistry()
tools.register(RunSqlTool(sql_runner=SqliteRunner("./data.db")))

agent = Agent(llm_service=llm, tool_registry=tools)
VannaFastAPIServer(agent).run(host='0.0.0.0', port=8000)
```

### Frontend HTML

```html
<!DOCTYPE html>
<html>
<head>
    <title>Chat with Database</title>
    <script src="https://img.vanna.ai/vanna-components.js"></script>
</head>
<body>
    <vanna-chat
        sse-endpoint="http://localhost:8000/api/vanna/v2/chat_sse"
        theme="light">
    </vanna-chat>
</body>
</html>
```

### Custom Tool Template

```python
from vanna.core.tool import Tool, ToolContext, ToolResult
from pydantic import BaseModel, Field
from typing import Type

class MyArgs(BaseModel):
    param1: str = Field(description="First parameter")
    param2: int = Field(description="Second parameter", default=10)

class MyCustomTool(Tool[MyArgs]):
    @property
    def name(self) -> str:
        return "my_tool"

    @property
    def description(self) -> str:
        return "Description of what this tool does"

    @property
    def access_groups(self) -> list[str]:
        return ["user", "admin"]

    def get_args_schema(self) -> Type[MyArgs]:
        return MyArgs

    async def execute(self, context: ToolContext, args: MyArgs) -> ToolResult:
        user = context.user
        # Your logic here
        result = f"Processed {args.param1} with {args.param2} for {user.email}"
        return ToolResult(success=True, result_for_llm=result)

# Register: tools.register(MyCustomTool())
```

---

## Key Imports Cheat Sheet

```python
# Core
from vanna import Agent, AgentConfig

# User Management
from vanna.core.user import UserResolver, User, RequestContext

# Tool System
from vanna.core.registry import ToolRegistry
from vanna.core.tool import Tool, ToolContext, ToolResult
from vanna.tools import RunSqlTool, SearchDocsTool, SearchMemoryTool

# LLM Services
from vanna.integrations.anthropic import AnthropicLlmService
from vanna.integrations.openai import OpenAILlmService
from vanna.integrations.azure import AzureOpenAILlmService
from vanna.integrations.ollama import OllamaLlmService
from vanna.integrations.gemini import GeminiLlmService
from vanna.integrations.bedrock import BedrockLlmService
from vanna.integrations.mistral import MistralLlmService

# Database Runners
from vanna.integrations.postgres import PostgresRunner
from vanna.integrations.mysql import MySQLRunner
from vanna.integrations.sqlite import SqliteRunner
from vanna.integrations.snowflake import SnowflakeRunner
from vanna.integrations.bigquery import BigQueryRunner
from vanna.integrations.duckdb import DuckDBRunner
from vanna.integrations.clickhouse import ClickHouseRunner

# Servers
from vanna.servers.fastapi import VannaFastAPIServer
from vanna.servers.fastapi.routes import register_chat_routes
from vanna.servers.flask import VannaFlaskServer
from vanna.servers.base import ChatHandler

# Migration (0.x compatibility)
from vanna.legacy.adapter import LegacyVannaAdapter
```

---

**Version**: Vanna 2.0+
**License**: MIT
**Python**: 3.8+
