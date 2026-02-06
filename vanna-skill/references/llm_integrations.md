# LLM Integrations

Vanna supports multiple LLM providers through LlmService implementations.

## Anthropic Claude

```python
from vanna.integrations.anthropic import AnthropicLlmService

llm = AnthropicLlmService(
    model="claude-sonnet-4-5",
    api_key="sk-ant-..."
)
```

### Available Models

- `claude-opus-4-5` - Most capable, best for complex queries
- `claude-sonnet-4-5` - Balanced performance and cost
- `claude-haiku-4-5` - Fastest, lowest cost

### With Configuration

```python
llm = AnthropicLlmService(
    model="claude-sonnet-4-5",
    api_key="sk-ant-...",
    max_tokens=4096,
    temperature=0.7
)
```

## OpenAI

```python
from vanna.integrations.openai import OpenAILlmService

llm = OpenAILlmService(
    model="gpt-4o",
    api_key="sk-..."
)
```

### Available Models

- `gpt-4o` - Multimodal, best quality
- `gpt-4-turbo` - Fast, high quality
- `gpt-3.5-turbo` - Fastest, lowest cost

### With Configuration

```python
llm = OpenAILlmService(
    model="gpt-4o",
    api_key="sk-...",
    max_tokens=4096,
    temperature=0.7,
    organization="org-..."
)
```

## Azure OpenAI

```python
from vanna.integrations.azure import AzureOpenAILlmService

llm = AzureOpenAILlmService(
    deployment_name="gpt-4",
    azure_endpoint="https://xxx.openai.azure.com/",
    api_key="...",
    api_version="2024-02-01"
)
```

### With Managed Identity

```python
from azure.identity import DefaultAzureCredential

llm = AzureOpenAILlmService(
    deployment_name="gpt-4",
    azure_endpoint="https://xxx.openai.azure.com/",
    credential=DefaultAzureCredential()
)
```

## Ollama (Local/Self-Hosted)

```python
from vanna.integrations.ollama import OllamaLlmService

llm = OllamaLlmService(
    model="llama3",
    base_url="http://localhost:11434"
)
```

### Available Models

- `llama3` - Meta Llama 3
- `mistral` - Mistral 7B
- `codellama` - Code-optimized Llama
- `mixtral` - Mixtral 8x7B

### With Configuration

```python
llm = OllamaLlmService(
    model="llama3:70b",
    base_url="http://localhost:11434",
    num_ctx=8192,
    temperature=0.7
)
```

## Google Gemini

```python
from vanna.integrations.gemini import GeminiLlmService

llm = GeminiLlmService(
    model="gemini-pro",
    api_key="..."
)
```

### Available Models

- `gemini-pro` - Text generation
- `gemini-pro-vision` - Multimodal

## AWS Bedrock

```python
from vanna.integrations.bedrock import BedrockLlmService

llm = BedrockLlmService(
    model_id="anthropic.claude-3-sonnet-20240229-v1:0",
    region_name="us-east-1"
)
```

### Available Models

- `anthropic.claude-3-sonnet-*` - Claude Sonnet
- `anthropic.claude-3-haiku-*` - Claude Haiku
- `amazon.titan-text-*` - Amazon Titan
- `meta.llama3-*` - Llama 3

### With Credentials

```python
llm = BedrockLlmService(
    model_id="anthropic.claude-3-sonnet-20240229-v1:0",
    region_name="us-east-1",
    aws_access_key_id="...",
    aws_secret_access_key="..."
)
```

## Mistral AI

```python
from vanna.integrations.mistral import MistralLlmService

llm = MistralLlmService(
    model="mistral-large-latest",
    api_key="..."
)
```

### Available Models

- `mistral-large-latest` - Most capable
- `mistral-medium` - Balanced
- `mistral-small` - Fast

## Custom LlmService

Implement your own for unsupported providers:

```python
from vanna.core.llm_service import LlmService
from typing import AsyncIterator

class MyLlmService(LlmService):
    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model
    
    async def generate(
        self,
        messages: list[dict],
        tools: list[dict] | None = None
    ) -> AsyncIterator[dict]:
        # Your implementation
        response = await self.client.chat(
            model=self.model,
            messages=messages,
            tools=tools
        )
        
        for chunk in response:
            yield {"type": "text", "content": chunk.text}
```

## LLM Middlewares

Add caching, logging, or prompt engineering:

```python
from vanna.core.middleware import LlmMiddleware

class CachingMiddleware(LlmMiddleware):
    async def process(self, messages, tools, next_fn):
        cache_key = self.compute_key(messages)
        
        if cached := await self.cache.get(cache_key):
            yield cached
            return
        
        result = []
        async for chunk in next_fn(messages, tools):
            result.append(chunk)
            yield chunk
        
        await self.cache.set(cache_key, result)

llm = AnthropicLlmService(...)
llm.add_middleware(CachingMiddleware())
```
