# Custom Tools

Extend Vanna with domain-specific tools by implementing the `Tool` base class.

## Tool Basics

### Simple Tool

```python
from vanna.core.tool import Tool, ToolContext, ToolResult
from pydantic import BaseModel, Field
from typing import Type

class GreetArgs(BaseModel):
    name: str = Field(description="Name to greet")

class GreetTool(Tool[GreetArgs]):
    @property
    def name(self) -> str:
        return "greet"
    
    @property
    def description(self) -> str:
        return "Greet a user by name"
    
    @property
    def access_groups(self) -> list[str]:
        return ["user", "admin"]
    
    def get_args_schema(self) -> Type[GreetArgs]:
        return GreetArgs
    
    async def execute(self, context: ToolContext, args: GreetArgs) -> ToolResult:
        return ToolResult(
            success=True,
            result_for_llm=f"Hello, {args.name}!"
        )

# Register
tools.register(GreetTool())
```

## Tool with Dependencies

```python
class EmailArgs(BaseModel):
    recipient: str = Field(description="Email recipient")
    subject: str = Field(description="Email subject")
    body: str = Field(description="Email body")

class EmailTool(Tool[EmailArgs]):
    def __init__(self, email_service: EmailService):
        self.email_service = email_service
    
    @property
    def name(self) -> str:
        return "send_email"
    
    @property
    def access_groups(self) -> list[str]:
        return ["send_email"]  # Only users with this group
    
    def get_args_schema(self) -> Type[EmailArgs]:
        return EmailArgs
    
    async def execute(self, context: ToolContext, args: EmailArgs) -> ToolResult:
        user = context.user  # Automatically injected
        
        await self.email_service.send(
            from_email=user.email,
            to=args.recipient,
            subject=args.subject,
            body=args.body
        )
        
        return ToolResult(
            success=True,
            result_for_llm=f"Email sent to {args.recipient}"
        )

# Register with dependency
email_service = EmailService(smtp_host="...")
tools.register(EmailTool(email_service))
```

## Tool with UI Components

Return rich UI components instead of text:

```python
from vanna.core.components import Table, Chart, CodeBlock

class AnalyzeArgs(BaseModel):
    query: str = Field(description="Analysis query")

class AnalyzeTool(Tool[AnalyzeArgs]):
    @property
    def name(self) -> str:
        return "analyze_data"
    
    async def execute(self, context: ToolContext, args: AnalyzeArgs) -> ToolResult:
        data = await self.get_data(args.query)
        
        return ToolResult(
            success=True,
            result_for_llm="Analysis complete",
            components=[
                Table(
                    columns=["Name", "Value"],
                    rows=data
                ),
                Chart(
                    type="bar",
                    data=data,
                    title="Analysis Results"
                )
            ]
        )
```

## ToolContext

Access request context in tools:

```python
async def execute(self, context: ToolContext, args: Args) -> ToolResult:
    # User information
    user = context.user
    user.id          # User ID
    user.email       # User email
    user.group_memberships  # Groups for permissions
    user.metadata    # Custom metadata
    
    # Request context
    request = context.request_context
    request.get_header("Authorization")
    request.get_cookie("session")
    
    # Conversation context
    context.conversation_id
    context.message_history
    
    return ToolResult(...)
```

## ToolResult

Structure tool responses:

```python
return ToolResult(
    success=True,                    # Was execution successful?
    result_for_llm="Analysis done",  # Text for LLM to use
    components=[                     # Rich UI components
        Table(...),
        Chart(...),
        CodeBlock(...)
    ],
    metadata={                       # Additional data
        "rows_affected": 100,
        "execution_time": 1.5
    }
)
```

## Built-in Tools

### RunSqlTool

Execute SQL queries:

```python
from vanna.tools import RunSqlTool

tools.register(RunSqlTool(
    sql_runner=postgres_runner,
    access_groups=["user", "admin"]
))
```

### SearchDocsTool

Search documentation via RAG:

```python
from vanna.tools import SearchDocsTool

tools.register(SearchDocsTool(
    vector_store=my_vector_store,
    access_groups=["user", "admin"]
))
```

### SearchMemoryTool

Search saved successful queries:

```python
from vanna.tools import SearchMemoryTool

tools.register(SearchMemoryTool(
    memory_store=my_memory_store,
    access_groups=["user", "admin"]
))
```

## Tool Registration

### Basic Registration

```python
tools = ToolRegistry()
tools.register(MyTool())
```

### With Access Groups Override

```python
tools.register_local_tool(
    MyTool(),
    access_groups=["admin"]  # Override tool's default
)
```

### List Registered Tools

```python
for tool in tools.list_tools():
    print(f"{tool.name}: {tool.description}")
```

## Error Handling

```python
async def execute(self, context: ToolContext, args: Args) -> ToolResult:
    try:
        result = await self.do_work(args)
        return ToolResult(success=True, result_for_llm=result)
    except PermissionError:
        return ToolResult(
            success=False,
            result_for_llm="Permission denied"
        )
    except Exception as e:
        return ToolResult(
            success=False,
            result_for_llm=f"Error: {str(e)}"
        )
```

## Async Tools

All tools are async by default:

```python
async def execute(self, context: ToolContext, args: Args) -> ToolResult:
    # Use async operations
    data = await self.async_fetch_data()
    await self.async_process(data)
    return ToolResult(success=True, result_for_llm="Done")
```
