"""
Comprehensive Import and Assembly Tests for Vanna 2.0 App
===========================================================
Tests all imports, constructions, and configurations without starting the server.
"""

import sys
import os
from typing import List, Optional
import traceback

# Test results tracker
test_results = []


def test_result(test_name: str, passed: bool, message: str = ""):
    """Record a test result."""
    status = "PASS" if passed else "FAIL"
    test_results.append((test_name, passed, message))
    print(f"[{status}] {test_name}")
    if message:
        print(f"      {message}")


# ===========================================================================
# TEST 1: Import Tests - Verify all Vanna 2.0 imports work
# ===========================================================================
print("\n" + "=" * 70)
print("TEST SUITE 1: IMPORT TESTS")
print("=" * 70 + "\n")

# Test 1.1: Core imports
try:
    from vanna import Agent, AgentConfig, ToolRegistry

    test_result("1.1 Core imports (Agent, AgentConfig, ToolRegistry)", True)
except Exception as e:
    test_result("1.1 Core imports (Agent, AgentConfig, ToolRegistry)", False, str(e))

# Test 1.2: SystemPromptBuilder import
try:
    from vanna.core.system_prompt.base import SystemPromptBuilder

    test_result("1.2 SystemPromptBuilder import", True)
except Exception as e:
    test_result("1.2 SystemPromptBuilder import", False, str(e))

# Test 1.3: UserResolver imports
try:
    from vanna.core.user.resolver import UserResolver, RequestContext, User

    test_result("1.3 UserResolver imports (UserResolver, RequestContext, User)", True)
except Exception as e:
    test_result(
        "1.3 UserResolver imports (UserResolver, RequestContext, User)", False, str(e)
    )

# Test 1.4: DemoAgentMemory import
try:
    from vanna.integrations.local.agent_memory.in_memory import DemoAgentMemory

    test_result("1.4 DemoAgentMemory import", True)
except Exception as e:
    test_result("1.4 DemoAgentMemory import", False, str(e))

# Test 1.5: OpenAILlmService import
try:
    from vanna.integrations.openai import OpenAILlmService

    test_result("1.5 OpenAILlmService import", True)
except Exception as e:
    test_result("1.5 OpenAILlmService import", False, str(e))

# Test 1.6: SqliteRunner import
try:
    from vanna.integrations.sqlite import SqliteRunner

    test_result("1.6 SqliteRunner import", True)
except Exception as e:
    test_result("1.6 SqliteRunner import", False, str(e))

# Test 1.7: VannaFastAPIServer import
try:
    from vanna.servers.fastapi import VannaFastAPIServer

    test_result("1.7 VannaFastAPIServer import", True)
except Exception as e:
    test_result("1.7 VannaFastAPIServer import", False, str(e))

# Test 1.8: RunSqlTool import
try:
    from vanna.tools import RunSqlTool

    test_result("1.8 RunSqlTool import", True)
except Exception as e:
    test_result("1.8 RunSqlTool import", False, str(e))


# ===========================================================================
# TEST SUITE 2: LLM SERVICE CONSTRUCTION
# ===========================================================================
print("\n" + "=" * 70)
print("TEST SUITE 2: LLM SERVICE CONSTRUCTION")
print("=" * 70 + "\n")

# Test 2.1: OpenAILlmService with base_url parameter
try:
    from vanna.integrations.openai import OpenAILlmService

    llm = OpenAILlmService(
        model="google/gemini-2.0-flash-001",
        api_key="test-key",
        base_url="https://openrouter.ai/api/v1",
        default_headers={
            "HTTP-Referer": "http://localhost:8084",
            "X-Title": "Saudi Stocks AI Analyst",
        },
    )

    # Verify attributes exist
    has_base_url = hasattr(llm, "base_url") or hasattr(llm, "_base_url")
    has_headers = hasattr(llm, "default_headers") or hasattr(llm, "_default_headers")

    if has_base_url and has_headers:
        test_result(
            "2.1 OpenAILlmService construction with base_url and default_headers", True
        )
    else:
        test_result(
            "2.1 OpenAILlmService construction with base_url and default_headers",
            False,
            f"Missing attributes - has_base_url: {has_base_url}, has_headers: {has_headers}",
        )
except Exception as e:
    test_result(
        "2.1 OpenAILlmService construction with base_url and default_headers",
        False,
        str(e),
    )


# ===========================================================================
# TEST SUITE 3: SQLITE RUNNER CONSTRUCTION
# ===========================================================================
print("\n" + "=" * 70)
print("TEST SUITE 3: SQLITE RUNNER CONSTRUCTION")
print("=" * 70 + "\n")

# Test 3.1: SqliteRunner connection to existing database
try:
    from vanna.integrations.sqlite import SqliteRunner

    db_path = "./saudi_stocks.db"

    # Check if database file exists
    if not os.path.exists(db_path):
        test_result(
            "3.1 SqliteRunner connection to saudi_stocks.db",
            False,
            f"Database file not found at {db_path}",
        )
    else:
        sql_runner = SqliteRunner(db_path)
        test_result(
            "3.1 SqliteRunner connection to saudi_stocks.db",
            True,
            f"Connected to database at {db_path}",
        )
except Exception as e:
    test_result("3.1 SqliteRunner connection to saudi_stocks.db", False, str(e))


# ===========================================================================
# TEST SUITE 4: TOOL REGISTRY
# ===========================================================================
print("\n" + "=" * 70)
print("TEST SUITE 4: TOOL REGISTRY")
print("=" * 70 + "\n")

# Test 4.1: ToolRegistry register_local_tool method
try:
    from vanna import ToolRegistry
    from vanna.tools import RunSqlTool
    from vanna.integrations.sqlite import SqliteRunner

    tools = ToolRegistry()

    # Verify register_local_tool method exists
    if hasattr(tools, "register_local_tool"):
        # Try to register a tool
        sql_runner = SqliteRunner(":memory:")  # Use in-memory DB for testing
        tools.register_local_tool(
            RunSqlTool(sql_runner=sql_runner), access_groups=["admin", "user"]
        )
        test_result(
            "4.1 ToolRegistry.register_local_tool method exists and works", True
        )
    else:
        test_result(
            "4.1 ToolRegistry.register_local_tool method exists and works",
            False,
            "register_local_tool method not found",
        )

    # Test 4.2: Verify 'register' method does NOT exist (should use register_local_tool)
    if not hasattr(tools, "register"):
        test_result(
            "4.2 ToolRegistry does not have 'register' method (uses register_local_tool)",
            True,
        )
    else:
        test_result(
            "4.2 ToolRegistry does not have 'register' method (uses register_local_tool)",
            False,
            "Unexpected 'register' method found",
        )

except Exception as e:
    test_result(
        "4.1 ToolRegistry.register_local_tool method exists and works", False, str(e)
    )


# ===========================================================================
# TEST SUITE 5: USER RESOLVER SUBCLASS
# ===========================================================================
print("\n" + "=" * 70)
print("TEST SUITE 5: USER RESOLVER SUBCLASS")
print("=" * 70 + "\n")

# Test 5.1: DefaultUserResolver is proper subclass of UserResolver
try:
    from vanna.core.user.resolver import UserResolver, RequestContext, User

    class DefaultUserResolver(UserResolver):
        async def resolve_user(self, request_context: RequestContext) -> User:
            return User(
                id="default_user",
                email="user@localhost",
                group_memberships=["admin", "user"],
            )

    # Verify it's a subclass
    if issubclass(DefaultUserResolver, UserResolver):
        test_result("5.1 DefaultUserResolver is proper subclass of UserResolver", True)
    else:
        test_result(
            "5.1 DefaultUserResolver is proper subclass of UserResolver",
            False,
            "Not a valid subclass",
        )

    # Test 5.2: Verify resolve_user method exists and has correct signature
    resolver = DefaultUserResolver()
    if hasattr(resolver, "resolve_user"):
        import inspect

        sig = inspect.signature(resolver.resolve_user)
        params = list(sig.parameters.keys())
        if "request_context" in params:
            test_result(
                "5.2 DefaultUserResolver.resolve_user has correct signature", True
            )
        else:
            test_result(
                "5.2 DefaultUserResolver.resolve_user has correct signature",
                False,
                f"Expected 'request_context' parameter, found: {params}",
            )
    else:
        test_result(
            "5.2 DefaultUserResolver.resolve_user has correct signature",
            False,
            "resolve_user method not found",
        )

except Exception as e:
    test_result(
        "5.1 DefaultUserResolver is proper subclass of UserResolver", False, str(e)
    )


# ===========================================================================
# TEST SUITE 6: SYSTEM PROMPT BUILDER SUBCLASS
# ===========================================================================
print("\n" + "=" * 70)
print("TEST SUITE 6: SYSTEM PROMPT BUILDER SUBCLASS")
print("=" * 70 + "\n")

# Test 6.1: SaudiStocksSystemPromptBuilder implements abstract method
try:
    from vanna.core.system_prompt.base import SystemPromptBuilder
    from vanna.core.user.resolver import User

    SYSTEM_PROMPT = "Test system prompt for Saudi stocks"

    class SaudiStocksSystemPromptBuilder(SystemPromptBuilder):
        async def build_system_prompt(
            self, user: User, tools: List["ToolSchema"]
        ) -> Optional[str]:
            return SYSTEM_PROMPT

    # Verify it's a subclass
    if issubclass(SaudiStocksSystemPromptBuilder, SystemPromptBuilder):
        test_result("6.1 SaudiStocksSystemPromptBuilder is proper subclass", True)
    else:
        test_result(
            "6.1 SaudiStocksSystemPromptBuilder is proper subclass",
            False,
            "Not a valid subclass",
        )

    # Test 6.2: Verify build_system_prompt method exists
    builder = SaudiStocksSystemPromptBuilder()
    if hasattr(builder, "build_system_prompt"):
        import inspect

        sig = inspect.signature(builder.build_system_prompt)
        params = list(sig.parameters.keys())
        if "user" in params and "tools" in params:
            test_result(
                "6.2 SaudiStocksSystemPromptBuilder.build_system_prompt has correct signature",
                True,
            )
        else:
            test_result(
                "6.2 SaudiStocksSystemPromptBuilder.build_system_prompt has correct signature",
                False,
                f"Expected 'user' and 'tools' parameters, found: {params}",
            )
    else:
        test_result(
            "6.2 SaudiStocksSystemPromptBuilder.build_system_prompt has correct signature",
            False,
            "build_system_prompt method not found",
        )

except Exception as e:
    test_result("6.1 SaudiStocksSystemPromptBuilder is proper subclass", False, str(e))


# ===========================================================================
# TEST SUITE 7: AGENT ASSEMBLY
# ===========================================================================
print("\n" + "=" * 70)
print("TEST SUITE 7: AGENT ASSEMBLY")
print("=" * 70 + "\n")

# Test 7.1: Agent can be constructed with all required parameters
try:
    from vanna import Agent, AgentConfig, ToolRegistry
    from vanna.integrations.openai import OpenAILlmService
    from vanna.integrations.sqlite import SqliteRunner
    from vanna.integrations.local.agent_memory.in_memory import DemoAgentMemory
    from vanna.tools import RunSqlTool
    from vanna.core.system_prompt.base import SystemPromptBuilder
    from vanna.core.user.resolver import UserResolver, RequestContext, User

    # Create minimal components
    test_llm = OpenAILlmService(
        model="test-model",
        api_key="test-key",
        base_url="https://test.com/api",
    )

    test_tools = ToolRegistry()
    test_sql_runner = SqliteRunner(":memory:")
    test_tools.register_local_tool(
        RunSqlTool(sql_runner=test_sql_runner), access_groups=["admin"]
    )

    class TestUserResolver(UserResolver):
        async def resolve_user(self, request_context: RequestContext) -> User:
            return User(id="test", email="test@test.com", group_memberships=["admin"])

    class TestSystemPromptBuilder(SystemPromptBuilder):
        async def build_system_prompt(
            self, user: User, tools: List["ToolSchema"]
        ) -> Optional[str]:
            return "Test prompt"

    test_config = AgentConfig(stream_responses=True, max_tool_iterations=5)

    # Assemble agent
    agent = Agent(
        llm_service=test_llm,
        tool_registry=test_tools,
        user_resolver=TestUserResolver(),
        agent_memory=DemoAgentMemory(max_items=100),
        system_prompt_builder=TestSystemPromptBuilder(),
        config=test_config,
    )

    test_result("7.1 Agent construction with all required parameters", True)

    # Test 7.2: Verify agent has expected attributes
    if (
        hasattr(agent, "llm_service")
        and hasattr(agent, "tool_registry")
        and hasattr(agent, "config")
    ):
        test_result(
            "7.2 Agent has expected attributes (llm_service, tool_registry, config)",
            True,
        )
    else:
        test_result(
            "7.2 Agent has expected attributes (llm_service, tool_registry, config)",
            False,
            "Missing expected attributes",
        )

except Exception as e:
    test_result("7.1 Agent construction with all required parameters", False, str(e))
    traceback.print_exc()


# ===========================================================================
# TEST SUITE 8: VANNA FASTAPI SERVER
# ===========================================================================
print("\n" + "=" * 70)
print("TEST SUITE 8: VANNA FASTAPI SERVER")
print("=" * 70 + "\n")

# Test 8.1: VannaFastAPIServer can create the app
try:
    from vanna.servers.fastapi import VannaFastAPIServer

    # Use the agent created in previous test
    server = VannaFastAPIServer(agent)

    test_result("8.1 VannaFastAPIServer construction", True)

    # Test 8.2: Verify server has app attribute
    if hasattr(server, "app"):
        test_result("8.2 VannaFastAPIServer has 'app' attribute", True)
    else:
        test_result(
            "8.2 VannaFastAPIServer has 'app' attribute",
            False,
            "Missing 'app' attribute",
        )

except Exception as e:
    test_result("8.1 VannaFastAPIServer construction", False, str(e))
    traceback.print_exc()


# ===========================================================================
# TEST SUITE 9: SERVER ENDPOINTS
# ===========================================================================
print("\n" + "=" * 70)
print("TEST SUITE 9: SERVER ENDPOINTS")
print("=" * 70 + "\n")

# Test 9.1: Verify FastAPI app has expected routes
try:
    if hasattr(server, "app"):
        # Get all routes from the FastAPI app
        routes = [route.path for route in server.app.routes]

        # Check for chat SSE endpoint
        has_chat_sse = any("/chat" in route for route in routes)
        if has_chat_sse:
            test_result(
                "9.1 FastAPI app has chat/SSE endpoint", True, f"Found routes: {routes}"
            )
        else:
            test_result(
                "9.1 FastAPI app has chat/SSE endpoint",
                False,
                f"Routes found: {routes}",
            )

        # Check for health check endpoint
        has_health = any("/health" in route for route in routes)
        if has_health:
            test_result("9.2 FastAPI app has health check endpoint", True)
        else:
            test_result(
                "9.2 FastAPI app has health check endpoint",
                False,
                f"Routes found: {routes}",
            )

        # Test 9.3: Display all routes
        print(f"\n      All available routes ({len(routes)}):")
        for route in routes:
            print(f"      - {route}")

    else:
        test_result(
            "9.1 FastAPI app has chat/SSE endpoint", False, "Server app not available"
        )
        test_result(
            "9.2 FastAPI app has health check endpoint",
            False,
            "Server app not available",
        )

except Exception as e:
    test_result("9.1 FastAPI app has expected routes", False, str(e))
    traceback.print_exc()


# ===========================================================================
# TEST SUITE 10: CONFIGURATION
# ===========================================================================
print("\n" + "=" * 70)
print("TEST SUITE 10: CONFIGURATION")
print("=" * 70 + "\n")

# Test 10.1: AgentConfig has stream_responses=True
try:
    from vanna import AgentConfig

    config = AgentConfig(
        stream_responses=True,
        max_tool_iterations=10,
    )

    if hasattr(config, "stream_responses") and config.stream_responses == True:
        test_result("10.1 AgentConfig has stream_responses=True", True)
    else:
        test_result(
            "10.1 AgentConfig has stream_responses=True",
            False,
            f"stream_responses = {getattr(config, 'stream_responses', 'NOT FOUND')}",
        )

    # Test 10.2: AgentConfig has max_tool_iterations=10
    if hasattr(config, "max_tool_iterations") and config.max_tool_iterations == 10:
        test_result("10.2 AgentConfig has max_tool_iterations=10", True)
    else:
        test_result(
            "10.2 AgentConfig has max_tool_iterations=10",
            False,
            f"max_tool_iterations = {getattr(config, 'max_tool_iterations', 'NOT FOUND')}",
        )

except Exception as e:
    test_result("10.1 AgentConfig configuration", False, str(e))


# ===========================================================================
# SUMMARY
# ===========================================================================
print("\n" + "=" * 70)
print("TEST SUMMARY")
print("=" * 70 + "\n")

total_tests = len(test_results)
passed_tests = sum(1 for _, passed, _ in test_results if passed)
failed_tests = total_tests - passed_tests

print(f"Total Tests: {total_tests}")
print(f"Passed: {passed_tests}")
print(f"Failed: {failed_tests}")
print(f"Success Rate: {(passed_tests / total_tests) * 100:.1f}%")

if failed_tests > 0:
    print("\n" + "=" * 70)
    print("FAILED TESTS")
    print("=" * 70 + "\n")
    for name, passed, message in test_results:
        if not passed:
            print(f"❌ {name}")
            if message:
                print(f"   {message}")

print("\n" + "=" * 70)
print("TEST EXECUTION COMPLETE")
print("=" * 70)

# Exit with appropriate code
sys.exit(0 if failed_tests == 0 else 1)
