# Enterprise Features

Vanna 2.0+ includes production-ready enterprise features.

## User-Aware Security

### UserResolver

Extract user identity from requests:

```python
from vanna.core.user import UserResolver, User, RequestContext

class MyUserResolver(UserResolver):
    async def resolve_user(self, request_context: RequestContext) -> User:
        # Extract from JWT
        token = request_context.get_header('Authorization')
        user_data = self.decode_jwt(token)
        
        return User(
            id=user_data['id'],
            email=user_data['email'],
            group_memberships=user_data['groups'],
            metadata={'tenant_id': user_data['tenant_id']}
        )
```

### Group-Based Permissions

```python
class SensitiveTool(Tool):
    @property
    def access_groups(self) -> list[str]:
        return ["admin", "data_analyst"]  # Only these groups

# User with group_memberships=["user"] - DENIED
# User with group_memberships=["admin"] - ALLOWED
```

## Row-Level Security

Filter SQL queries per user:

```python
class SecureSqlRunner(PostgresRunner):
    async def execute(self, sql: str, user: User) -> DataFrame:
        # Get user's tenant from metadata
        tenant_id = user.metadata.get('tenant_id')
        
        # Inject filter into queries
        filtered_sql = self.apply_tenant_filter(sql, tenant_id)
        
        return await super().execute(filtered_sql, user)
    
    def apply_tenant_filter(self, sql: str, tenant_id: str) -> str:
        # Add WHERE tenant_id = '...' to all tables
        # Use SQL parser for robust implementation
        return modified_sql
```

## Audit Logging

Track all queries per user:

```python
from vanna.core.audit import AuditLogger
from datetime import datetime

class MyAuditLogger(AuditLogger):
    async def log_query(
        self,
        user_id: str,
        query: str,
        sql: str,
        result: any,
        execution_time: float
    ):
        await self.db.insert("audit_log", {
            "user_id": user_id,
            "query": query,
            "sql": sql,
            "row_count": len(result) if result else 0,
            "execution_time_ms": execution_time * 1000,
            "timestamp": datetime.utcnow()
        })

agent = Agent(
    llm_service=llm,
    tool_registry=tools,
    user_resolver=user_resolver,
    audit_logger=MyAuditLogger()
)
```

## Rate Limiting

Implement per-user quotas:

```python
from vanna import AgentConfig

async def rate_limit_hook(context):
    user = context.user
    
    # Check requests in last hour
    requests = await get_request_count(user.id, period="1h")
    
    if requests > 100:
        raise RateLimitError("Rate limit exceeded: 100 requests/hour")
    
    # Check daily limit
    daily = await get_request_count(user.id, period="24h")
    
    if daily > 1000:
        raise RateLimitError("Daily limit exceeded: 1000 requests/day")

config = AgentConfig(
    pre_execution_hooks=[rate_limit_hook]
)
```

## Lifecycle Hooks

Add logic at key points in request lifecycle:

### Pre-Execution Hooks

Run before agent processes request:

```python
async def quota_check(context):
    user = context.user
    if await is_quota_exceeded(user.id):
        raise QuotaExceededError("Monthly quota exceeded")

async def content_filter(context):
    message = context.message
    if contains_pii(message):
        raise SecurityError("PII detected in query")

config = AgentConfig(
    pre_execution_hooks=[quota_check, content_filter]
)
```

### Post-Execution Hooks

Run after agent completes:

```python
async def log_usage(context, result):
    await record_usage(
        user_id=context.user.id,
        tokens=result.token_usage,
        cost=calculate_cost(result.token_usage)
    )

async def notify_admin(context, result):
    if result.contains_sensitive_data:
        await send_alert(
            f"Sensitive data accessed by {context.user.email}"
        )

config = AgentConfig(
    post_execution_hooks=[log_usage, notify_admin]
)
```

## Observability

### Built-in Tracing

```python
from vanna.core.tracing import TracingConfig

config = AgentConfig(
    tracing=TracingConfig(
        enabled=True,
        service_name="vanna-agent",
        exporter="otlp",
        endpoint="http://jaeger:4317"
    )
)
```

### Metrics

```python
from vanna.core.metrics import MetricsConfig

config = AgentConfig(
    metrics=MetricsConfig(
        enabled=True,
        port=9090,
        path="/metrics"
    )
)

# Exposes Prometheus metrics:
# - vanna_requests_total
# - vanna_request_duration_seconds
# - vanna_llm_tokens_total
# - vanna_sql_execution_seconds
```

### Logging

```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Enable debug for Vanna
logging.getLogger('vanna').setLevel(logging.DEBUG)
```

## Conversation Storage

Persist conversation history:

```python
from vanna.core.storage import ConversationStorage

class PostgresConversationStorage(ConversationStorage):
    async def save(self, conversation_id: str, messages: list[dict]):
        await self.db.upsert("conversations", {
            "id": conversation_id,
            "messages": json.dumps(messages),
            "updated_at": datetime.utcnow()
        })
    
    async def load(self, conversation_id: str) -> list[dict]:
        row = await self.db.get("conversations", id=conversation_id)
        return json.loads(row['messages']) if row else []

agent = Agent(
    ...,
    conversation_storage=PostgresConversationStorage(connection)
)
```

## Multi-Tenant Architecture

### Tenant Isolation

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

class TenantAwareSqlRunner(PostgresRunner):
    async def execute(self, sql: str, user: User) -> DataFrame:
        tenant_id = user.metadata['tenant_id']
        
        # Connect to tenant-specific schema
        schema = f"tenant_{tenant_id}"
        self.set_search_path(schema)
        
        return await super().execute(sql, user)
```

### Per-Tenant Configuration

```python
class TenantConfigProvider:
    async def get_config(self, tenant_id: str) -> dict:
        return await self.db.get("tenant_configs", id=tenant_id)

# Use different LLMs per tenant
llm_service = TenantAwareLlmService(config_provider)
```

## Security Best Practices

1. **Always validate user identity** in UserResolver
2. **Use group-based permissions** on all sensitive tools
3. **Implement row-level security** for multi-tenant data
4. **Enable audit logging** for compliance
5. **Set rate limits** to prevent abuse
6. **Use HTTPS** for all API endpoints
7. **Sanitize SQL** before execution
8. **Never expose raw errors** to users
