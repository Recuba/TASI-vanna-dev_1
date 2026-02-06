# Vanna AI Reference Documentation

## Overview

Vanna is a Python framework for converting natural language to SQL using LLMs and Agentic Retrieval. Version 2.0+ introduces a complete rewrite focused on user-aware agents and production deployments.

## Reference Files

### Core Documentation

- **[getting_started.md](getting_started.md)** - Installation, quickstart, and first steps
- **[architecture.md](architecture.md)** - System design, components, and request flow

### Integrations

- **[database_integrations.md](database_integrations.md)** - PostgreSQL, MySQL, SQLite, Snowflake, BigQuery, DuckDB, ClickHouse, and more
- **[llm_integrations.md](llm_integrations.md)** - OpenAI, Anthropic, Azure, Ollama, Gemini, Bedrock, Mistral

### Development

- **[tools.md](tools.md)** - Creating custom tools, ToolContext, ToolResult
- **[web_ui.md](web_ui.md)** - `<vanna-chat>` component, styling, events

### Production

- **[enterprise.md](enterprise.md)** - Security, audit logging, rate limiting, observability
- **[migration.md](migration.md)** - Migrating from Vanna 0.x to 2.0+

## Quick Links

### Installation

```bash
pip install vanna
pip install 'vanna[flask,anthropic]'
```

### Minimal Example

```python
from vanna import Agent
from vanna.integrations.anthropic import AnthropicLlmService
from vanna.integrations.sqlite import SqliteRunner
from vanna.tools import RunSqlTool
from vanna.core.registry import ToolRegistry

llm = AnthropicLlmService(model="claude-haiku-4-5")
tools = ToolRegistry()
tools.register(RunSqlTool(sql_runner=SqliteRunner("./db.sqlite")))

agent = Agent(llm_service=llm, tool_registry=tools)
```

### Web Component

```html
<script src="https://img.vanna.ai/vanna-components.js"></script>
<vanna-chat sse-endpoint="/api/vanna/v2/chat_sse"></vanna-chat>
```

## Key Concepts

1. **Agent** - Orchestrates LLM and tools
2. **UserResolver** - Extracts user identity
3. **ToolRegistry** - Manages available tools
4. **LlmService** - Handles LLM interactions
5. **SqlRunner** - Executes SQL queries

## Supported Databases

| Database | Runner Class |
|----------|--------------|
| PostgreSQL | `PostgresRunner` |
| MySQL | `MySQLRunner` |
| SQLite | `SqliteRunner` |
| Snowflake | `SnowflakeRunner` |
| BigQuery | `BigQueryRunner` |
| DuckDB | `DuckDBRunner` |
| ClickHouse | `ClickHouseRunner` |
| Oracle | `OracleRunner` |
| SQL Server | `SQLServerRunner` |
| Redshift | `RedshiftRunner` |

## Supported LLMs

| Provider | Service Class |
|----------|---------------|
| Anthropic | `AnthropicLlmService` |
| OpenAI | `OpenAILlmService` |
| Azure OpenAI | `AzureOpenAILlmService` |
| Ollama | `OllamaLlmService` |
| Google Gemini | `GeminiLlmService` |
| AWS Bedrock | `BedrockLlmService` |
| Mistral | `MistralLlmService` |

## External Resources

- **Documentation**: https://vanna.ai/docs
- **GitHub**: https://github.com/vanna-ai/vanna
- **Discussions**: https://github.com/vanna-ai/vanna/discussions
- **Issues**: https://github.com/vanna-ai/vanna/issues
- **Enterprise Support**: support@vanna.ai

## Version

- **Current Version**: 2.0+
- **Python**: 3.8+
- **License**: MIT
