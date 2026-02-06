# Migration Guide: Vanna 0.x to 2.0+

Complete guide for migrating from legacy Vanna to the new agent framework.

## Overview of Changes

### What's New in 2.0+

- **User awareness** - Identity and permissions flow through every layer
- **Web component** - Pre-built UI with streaming responses
- **Tool registry** - Modular, extensible tool system
- **Rich UI components** - Tables, charts, status cards (not just text)
- **Streaming by default** - Progressive responses via SSE
- **Enterprise features** - Audit logs, rate limiting, observability
- **FastAPI/Flask servers** - Production-ready backends included

### What Changed from 0.x

| Feature | Vanna 0.x | Vanna 2.0+ |
|---------|-----------|------------|
| User Context | None | User flows through system |
| Interaction | `vn.ask()` | Agent-based with streaming |
| Tools | Monolithic methods | Modular Tool classes |
| Responses | Text/DataFrames | Rich UI components |
| Training | `vn.train()` | System prompts, RAG tools |
| Database | `vn.connect_to_*()` | SqlRunner implementations |
| Web UI | Custom | Built-in `<vanna-chat>` |
| Streaming | None | SSE by default |
| Permissions | None | Group-based access control |

## Migration Strategies

### Strategy 1: Legacy Adapter (Quick Migration)

Wrap your existing VannaBase instance:

```python
from vanna import Agent, AgentConfig
from vanna.servers.fastapi import VannaFastAPIServer
from vanna.core.user import UserResolver, User, RequestContext
from vanna.legacy.adapter import LegacyVannaAdapter
from vanna.integrations.anthropic import AnthropicLlmService

# Your existing 0.x setup (unchanged)
# vn = MyVanna(config={'model': 'gpt-4'})
# vn.connect_to_postgres(...)
# vn.train(ddl="...")

# NEW: Define user resolution
class SimpleUserResolver(UserResolver):
    async def resolve_user(self, request_context: RequestContext) -> User:
        user_email = request_context.get_cookie('vanna_email')
        if not user_email:
            raise ValueError("Missing cookie")
        
        if user_email == "admin@example.com":
            return User(id="admin", email=user_email, group_memberships=['admin'])
        
        return User(id=user_email, email=user_email, group_memberships=['user'])

# NEW: Wrap with legacy adapter
tools = LegacyVannaAdapter(vn)

# NEW: Set up LLM for Agent
llm = AnthropicLlmService(
    model="claude-haiku-4-5",
    api_key="YOUR_ANTHROPIC_API_KEY"
)

# NEW: Create agent
agent = Agent(
    llm_service=llm,
    tool_registry=tools,
    user_resolver=SimpleUserResolver(),
    config=AgentConfig()
)

# NEW: Run server
server = VannaFastAPIServer(agent)
server.run(host='0.0.0.0', port=8000)
```

**What LegacyVannaAdapter does:**
- Wraps `vn.run_sql()` as `run_sql` tool
- Exposes training data as searchable memory
- Maintains existing database connection

**Pros:**
- Minimal code changes
- Preserve existing training data
- Get new features immediately

**Cons:**
- Limited user awareness
- Can't leverage row-level security

### Strategy 2: Full Migration (Recommended)

#### Before (0.x)

```python
from vanna import VannaBase
from vanna.openai_chat import OpenAI_Chat
from vanna.chromadb import ChromaDB_VectorStore

class MyVanna(ChromaDB_VectorStore, OpenAI_Chat):
    def __init__(self, config=None):
        ChromaDB_VectorStore.__init__(self, config=config)
        OpenAI_Chat.__init__(self, config=config)

vn = MyVanna(config={'model': 'gpt-4', 'api_key': 'key'})
vn.connect_to_postgres(...)
vn.train(ddl="CREATE TABLE customers ...")
vn.train(question="Top customers?", sql="SELECT ...")

sql = vn.generate_sql("Who are the top customers?")
df = vn.run_sql(sql)
```

#### After (2.0+)

```python
from vanna import Agent, AgentConfig
from vanna.servers.fastapi import VannaFastAPIServer
from vanna.core.registry import ToolRegistry
from vanna.core.user import UserResolver, User, RequestContext
from vanna.integrations.anthropic import AnthropicLlmService
from vanna.tools import RunSqlTool
from vanna.integrations.postgres import PostgresRunner

# 1. Define user resolution
class MyUserResolver(UserResolver):
    async def resolve_user(self, request_context: RequestContext) -> User:
        token = request_context.get_header('Authorization')
        user_data = await self.validate_token(token)
        return User(
            id=user_data['id'],
            email=user_data['email'],
            group_memberships=user_data['groups']
        )

# 2. Set up tools
tools = ToolRegistry()
postgres_runner = PostgresRunner(
    host="localhost",
    dbname="mydb",
    user="user",
    password="password"
)
tools.register_local_tool(
    RunSqlTool(sql_runner=postgres_runner),
    access_groups=['user', 'admin']
)

# 3. Create agent
llm = AnthropicLlmService(model="claude-sonnet-4-5")
agent = Agent(
    llm_service=llm,
    tool_registry=tools,
    user_resolver=MyUserResolver(),
    config=AgentConfig(stream_responses=True)
)

# 4. Create server
server = VannaFastAPIServer(agent)
app = server.create_app()
```

## API Mapping

| 0.x Method | 2.0+ Equivalent |
|------------|-----------------|
| `vn.connect_to_postgres()` | `PostgresRunner(...)` |
| `vn.run_sql(sql)` | `RunSqlTool.execute()` |
| `vn.train(ddl=...)` | System prompts / context enrichers |
| `vn.train(question=..., sql=...)` | Memory tools / RAG |
| `vn.generate_sql(question)` | Agent handles automatically |
| `vn.ask(question)` | Agent with streaming components |

## Migration Checklist

- [ ] Install Vanna 2.0+: `pip install 'vanna[flask,anthropic]'`
- [ ] Choose migration strategy (Legacy Adapter or Full)
- [ ] Implement UserResolver for authentication
- [ ] Set up LlmService (OpenAI, Anthropic, etc.)
- [ ] Configure SqlRunner for your database
- [ ] Register tools in ToolRegistry
- [ ] Create Agent with configuration
- [ ] Set up server (FastAPI/Flask)
- [ ] Update frontend to use `<vanna-chat>`
- [ ] Test with sample queries
- [ ] Migrate training data if using Full Migration

## Recommended Path

1. **Start with Legacy Adapter** for quick migration
2. **Test thoroughly** with existing functionality
3. **Gradually migrate** critical paths to native 2.0+
4. **Remove Legacy Adapter** once fully migrated
