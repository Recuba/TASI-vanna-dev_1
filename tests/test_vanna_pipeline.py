"""Integration tests for the Vanna AI query pipeline.

Tests the core NL -> SQL -> response flow with mocked LLM service
to avoid real API calls while validating the pipeline assembly and execution.
"""

import uuid
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from vanna import Agent, AgentConfig, ToolRegistry
from vanna.core.llm.base import LlmService
from vanna.core.llm.models import LlmResponse
from vanna.core.system_prompt.base import SystemPromptBuilder
from vanna.core.tool.models import ToolCall, ToolContext
from vanna.core.user.models import User
from vanna.core.user.request_context import RequestContext
from vanna.core.user.resolver import UserResolver
from vanna.capabilities.sql_runner.models import RunSqlToolArgs
from vanna.integrations.local.agent_memory.in_memory import DemoAgentMemory
from vanna.integrations.sqlite import SqliteRunner
from vanna.tools import RunSqlTool, VisualizeDataTool

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
REAL_DB_PATH = PROJECT_ROOT / "saudi_stocks.db"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def sqlite_runner(test_db):
    """SqliteRunner backed by the temporary test database."""
    return SqliteRunner(str(test_db["path"]))


@pytest.fixture
def real_sqlite_runner():
    """SqliteRunner backed by the real saudi_stocks.db (read-only queries)."""
    if not REAL_DB_PATH.exists():
        pytest.skip("saudi_stocks.db not found")
    return SqliteRunner(str(REAL_DB_PATH))


@pytest.fixture
def tool_registry(sqlite_runner):
    """ToolRegistry with RunSqlTool and VisualizeDataTool registered."""
    registry = ToolRegistry()
    registry.register_local_tool(
        RunSqlTool(sql_runner=sqlite_runner), access_groups=["admin", "user"]
    )
    registry.register_local_tool(
        VisualizeDataTool(plotly_generator=MagicMock()),
        access_groups=["admin", "user"],
    )
    return registry


@pytest.fixture
def demo_memory():
    """DemoAgentMemory with a small limit for testing."""
    return DemoAgentMemory(max_items=50)


@pytest.fixture
def test_user():
    """A standard test user with 'user' group membership."""
    return User(
        id="test-user",
        email="test@example.com",
        group_memberships=["user"],
    )


@pytest.fixture
def tool_context(test_user, demo_memory):
    """Minimal ToolContext for executing tools in tests."""
    return ToolContext(
        user=test_user,
        conversation_id=str(uuid.uuid4()),
        request_id=str(uuid.uuid4()),
        agent_memory=demo_memory,
    )


# ===========================================================================
# Test: Agent assembly components
# ===========================================================================


class TestAgentAssemblyComponents:
    """Verify the Agent constructs correctly with all required components."""

    def test_agent_assembly_components(self, tool_registry, demo_memory):
        """Agent must accept all 5 required components without error."""
        mock_llm = MagicMock()
        mock_resolver = MagicMock()

        agent = Agent(
            llm_service=mock_llm,
            tool_registry=tool_registry,
            user_resolver=mock_resolver,
            agent_memory=demo_memory,
        )

        assert agent.llm_service is mock_llm
        assert agent.tool_registry is tool_registry
        assert agent.user_resolver is mock_resolver
        assert agent.agent_memory is demo_memory

    def test_agent_with_custom_system_prompt_builder(
        self, tool_registry, demo_memory
    ):
        """Agent accepts a custom SystemPromptBuilder."""

        class StubPromptBuilder(SystemPromptBuilder):
            async def build_system_prompt(self, user, tools):
                return "stub prompt"

        agent = Agent(
            llm_service=MagicMock(),
            tool_registry=tool_registry,
            user_resolver=MagicMock(),
            agent_memory=demo_memory,
            system_prompt_builder=StubPromptBuilder(),
        )
        assert agent.system_prompt_builder is not None


# ===========================================================================
# Test: Tool registry has required tools
# ===========================================================================


class TestToolRegistryTools:
    """Verify RunSqlTool and VisualizeDataTool are registered correctly."""

    @pytest.mark.asyncio
    async def test_tool_registry_has_required_tools(self, tool_registry):
        """Registry must contain both RunSqlTool and VisualizeDataTool."""
        tool_names = await tool_registry.list_tools()
        assert len(tool_names) >= 2

    @pytest.mark.asyncio
    async def test_tool_schemas_available_for_user(self, tool_registry, test_user):
        """Schemas visible to a user in the 'user' group."""
        schemas = await tool_registry.get_schemas(user=test_user)
        assert len(schemas) >= 2

    @pytest.mark.asyncio
    async def test_tool_schemas_available_for_admin(self, tool_registry):
        """Schemas visible to an admin user."""
        admin = User(
            id="admin", email="admin@test.com", group_memberships=["admin"]
        )
        schemas = await tool_registry.get_schemas(user=admin)
        assert len(schemas) >= 2


# ===========================================================================
# Test: System prompt contains schema
# ===========================================================================


class TestSystemPromptContainsSchema:
    """Verify the SaudiStocksSystemPromptBuilder produces expected content."""

    def test_system_prompt_contains_schema(self):
        """The system prompt must reference key database tables."""
        from config.prompts import SAUDI_STOCKS_SYSTEM_PROMPT

        expected_tables = [
            "companies",
            "market_data",
            "valuation_metrics",
            "profitability_metrics",
            "dividend_data",
            "financial_summary",
            "analyst_data",
            "balance_sheet",
            "income_statement",
            "cash_flow",
        ]
        for table in expected_tables:
            assert table in SAUDI_STOCKS_SYSTEM_PROMPT, (
                f"System prompt missing table: {table}"
            )

    def test_system_prompt_mentions_tickers(self):
        """The system prompt should mention Saudi ticker format."""
        from config.prompts import SAUDI_STOCKS_SYSTEM_PROMPT

        assert ".SR" in SAUDI_STOCKS_SYSTEM_PROMPT


# ===========================================================================
# Test: System prompt builder signature
# ===========================================================================


class TestSystemPromptBuilderSignature:
    """Verify build_system_prompt(self, user, tools) works correctly."""

    @pytest.mark.asyncio
    async def test_system_prompt_builder_signature(self, test_user):
        """SaudiStocksSystemPromptBuilder.build_system_prompt must be async
        and accept (user, tools) arguments."""
        import sys

        sys.path.insert(0, str(PROJECT_ROOT))
        from app import SaudiStocksSystemPromptBuilder

        builder = SaudiStocksSystemPromptBuilder()
        result = await builder.build_system_prompt(user=test_user, tools=[])
        assert result is not None
        assert isinstance(result, str)
        assert len(result) > 100  # Should be a substantial prompt

    def test_system_prompt_builder_is_subclass(self):
        """Must be a subclass of SystemPromptBuilder."""
        import sys

        sys.path.insert(0, str(PROJECT_ROOT))
        from app import SaudiStocksSystemPromptBuilder

        assert issubclass(SaudiStocksSystemPromptBuilder, SystemPromptBuilder)


# ===========================================================================
# Test: SQL tool executes valid query
# ===========================================================================


class TestSqlToolExecution:
    """Verify RunSqlTool executes queries against the real database."""

    @pytest.mark.asyncio
    async def test_sql_tool_executes_valid_query(
        self, real_sqlite_runner, demo_memory
    ):
        """RunSqlTool should successfully execute SELECT COUNT(*) FROM companies."""
        tool = RunSqlTool(sql_runner=real_sqlite_runner)
        user = User(id="test", email="t@t.com", group_memberships=["user"])
        ctx = ToolContext(
            user=user,
            conversation_id="conv-1",
            request_id="req-1",
            agent_memory=demo_memory,
        )
        args = RunSqlToolArgs(sql="SELECT COUNT(*) FROM companies")
        result = await tool.execute(ctx, args)

        assert result.success is True
        assert result.error is None
        assert "500" in result.result_for_llm  # 500 companies in real DB

    @pytest.mark.asyncio
    async def test_sql_tool_executes_select_with_filter(
        self, real_sqlite_runner, demo_memory
    ):
        """RunSqlTool should execute a filtered SELECT query."""
        tool = RunSqlTool(sql_runner=real_sqlite_runner)
        ctx = ToolContext(
            user=User(id="t", email="t@t.com", group_memberships=["user"]),
            conversation_id="conv-2",
            request_id="req-2",
            agent_memory=demo_memory,
        )
        args = RunSqlToolArgs(
            sql="SELECT ticker, short_name FROM companies WHERE ticker = '2222.SR'"
        )
        result = await tool.execute(ctx, args)

        assert result.success is True
        assert "2222.SR" in result.result_for_llm

    @pytest.mark.asyncio
    async def test_sql_tool_with_test_db(self, sqlite_runner, tool_context):
        """RunSqlTool works with the temporary test database fixture."""
        tool = RunSqlTool(sql_runner=sqlite_runner)
        args = RunSqlToolArgs(sql="SELECT COUNT(*) FROM companies")
        result = await tool.execute(tool_context, args)

        assert result.success is True
        # Test DB has 2 companies
        assert "2" in result.result_for_llm


# ===========================================================================
# Test: SQL tool rejects destructive queries
# ===========================================================================


class TestSqlToolRejectsDestructive:
    """Verify RunSqlTool rejects dangerous SQL statements."""

    @pytest.mark.asyncio
    async def test_sql_tool_handles_invalid_sql(self, sqlite_runner, tool_context):
        """RunSqlTool returns an error for syntactically invalid SQL."""
        tool = RunSqlTool(sql_runner=sqlite_runner)
        args = RunSqlToolArgs(sql="SELECTT * FROOM companies")
        result = await tool.execute(tool_context, args)

        assert result.success is False
        assert result.error is not None

    @pytest.mark.asyncio
    async def test_sql_tool_handles_nonexistent_table(
        self, sqlite_runner, tool_context
    ):
        """RunSqlTool returns an error when querying a nonexistent table."""
        tool = RunSqlTool(sql_runner=sqlite_runner)
        args = RunSqlToolArgs(sql="SELECT * FROM nonexistent_table")
        result = await tool.execute(tool_context, args)

        assert result.success is False
        assert result.error is not None

    @pytest.mark.asyncio
    async def test_sql_tool_does_not_block_writes(
        self, sqlite_runner, tool_context
    ):
        """RunSqlTool does NOT block write operations at the tool level.

        IMPORTANT FINDING: Vanna 2.0's RunSqlTool relies on LLM behavior
        and database-level permissions (read-only users) to prevent writes,
        NOT on tool-level SQL filtering. This test documents that behavior
        so production deployments use read-only database credentials.
        """
        tool = RunSqlTool(sql_runner=sqlite_runner)

        # INSERT succeeds (tool does not filter it)
        insert_args = RunSqlToolArgs(
            sql="INSERT INTO companies VALUES ('9999.SR','Test','Sector','Ind','SAU','SAR')"
        )
        insert_result = await tool.execute(tool_context, insert_args)
        assert insert_result.success is True

        # Verify the row was actually inserted
        check_args = RunSqlToolArgs(sql="SELECT COUNT(*) FROM companies")
        check_result = await tool.execute(tool_context, check_args)
        assert "3" in check_result.result_for_llm


# ===========================================================================
# Test: Agent memory stores and retrieves
# ===========================================================================


class TestAgentMemory:
    """Test DemoAgentMemory can store and retrieve items."""

    @pytest.mark.asyncio
    async def test_agent_memory_stores_and_retrieves(
        self, demo_memory, tool_context
    ):
        """save_text_memory / get_recent_text_memories roundtrip."""
        await demo_memory.save_text_memory("Test memory entry 1", tool_context)
        await demo_memory.save_text_memory("Test memory entry 2", tool_context)

        memories = await demo_memory.get_recent_text_memories(
            tool_context, limit=10
        )
        memory_texts = [m.content for m in memories]

        assert "Test memory entry 1" in memory_texts
        assert "Test memory entry 2" in memory_texts

    def test_agent_memory_respects_max_items(self):
        """DemoAgentMemory should accept max_items parameter."""
        mem = DemoAgentMemory(max_items=5)
        assert mem is not None

    @pytest.mark.asyncio
    async def test_agent_memory_clear(self, demo_memory, tool_context):
        """clear_memories should remove stored items."""
        await demo_memory.save_text_memory("to be cleared", tool_context)
        memories_before = await demo_memory.get_recent_text_memories(tool_context)
        assert len(memories_before) > 0

        await demo_memory.clear_memories(tool_context)
        memories_after = await demo_memory.get_recent_text_memories(tool_context)
        assert len(memories_after) == 0


# ===========================================================================
# Test: AgentConfig settings
# ===========================================================================


class TestAgentConfigSettings:
    """Verify AgentConfig has expected defaults and accepts overrides."""

    def test_agent_config_defaults(self):
        """Default AgentConfig should have sensible defaults."""
        cfg = AgentConfig()
        assert cfg.max_tool_iterations == 10
        assert cfg.stream_responses is True

    def test_agent_config_custom_values(self):
        """AgentConfig accepts custom max_tool_iterations and stream_responses."""
        cfg = AgentConfig(max_tool_iterations=5, stream_responses=False)
        assert cfg.max_tool_iterations == 5
        assert cfg.stream_responses is False

    def test_agent_config_from_app(self):
        """The config used in app.py should have stream_responses=True."""
        import sys

        sys.path.insert(0, str(PROJECT_ROOT))
        from app import config

        assert config.stream_responses is True
        assert config.max_tool_iterations >= 1


# ===========================================================================
# Test: End-to-end query pipeline with mocked LLM
# ===========================================================================


class MockUserResolver(UserResolver):
    """Resolver that always returns a fixed test user."""

    async def resolve_user(self, request_context):
        return User(
            id="mock-user",
            email="mock@test.com",
            group_memberships=["user"],
        )


class TestEndToEndQueryPipeline:
    """Test the full Agent.send_message flow with a mocked LLM.

    The LLM is mocked to return tool_calls that invoke RunSqlTool,
    verifying the pipeline wires: user message -> LLM -> tool call ->
    SQL execution -> tool result -> LLM final response -> UI components.
    """

    @pytest.fixture
    def mock_llm_service(self):
        """LlmService mock that returns a RunSqlTool call then a text response."""
        llm = MagicMock(spec=LlmService)

        # First call: LLM returns a tool call to run SQL
        sql_tool_response = LlmResponse(
            content=None,
            tool_calls=[
                ToolCall(
                    id="call-1",
                    name="run_sql",
                    arguments={"sql": "SELECT COUNT(*) FROM companies"},
                )
            ],
            finish_reason="tool_use",
        )

        # Second call: LLM returns a text summary
        text_response = LlmResponse(
            content="There are 2 companies in the database.",
            tool_calls=None,
            finish_reason="end_turn",
        )

        llm.send_request = AsyncMock(
            side_effect=[sql_tool_response, text_response]
        )
        llm.validate_tools = MagicMock(return_value=[])
        return llm

    @pytest.fixture
    def pipeline_agent(self, mock_llm_service, tool_registry, demo_memory):
        """Agent assembled with mocked LLM for pipeline testing."""
        return Agent(
            llm_service=mock_llm_service,
            tool_registry=tool_registry,
            user_resolver=MockUserResolver(),
            agent_memory=demo_memory,
            config=AgentConfig(
                stream_responses=False,
                max_tool_iterations=5,
            ),
        )

    @pytest.mark.asyncio
    async def test_send_message_invokes_sql_tool(self, pipeline_agent):
        """Agent.send_message should invoke RunSqlTool when LLM requests it."""
        request_ctx = RequestContext(headers={}, cookies={})
        components = []
        async for component in pipeline_agent.send_message(
            request_ctx, "How many companies are there?"
        ):
            components.append(component)

        # The LLM was called (at least the first request)
        assert pipeline_agent.llm_service.send_request.call_count >= 1

        # We should have received UI components (dataframe from SQL + text)
        assert len(components) > 0

    @pytest.mark.asyncio
    async def test_pipeline_passes_sql_result_back_to_llm(
        self, pipeline_agent
    ):
        """After RunSqlTool executes, the result is sent back to the LLM."""
        request_ctx = RequestContext(headers={}, cookies={})
        async for _ in pipeline_agent.send_message(
            request_ctx, "Count companies"
        ):
            pass

        # LLM should be called twice: once to get tool call, once with result
        assert pipeline_agent.llm_service.send_request.call_count == 2

        # The second call should include the tool result in messages
        second_call_args = (
            pipeline_agent.llm_service.send_request.call_args_list[1]
        )
        request = second_call_args[0][0]  # First positional arg (LlmRequest)
        # Messages should include the tool result
        messages = request.messages
        assert len(messages) >= 3  # user msg + assistant tool_call + tool result


# ===========================================================================
# Test: Chart generation pipeline
# ===========================================================================


class TestChartGenerationPipeline:
    """Test that VisualizeDataTool is invoked when LLM requests it."""

    @pytest.fixture
    def mock_plotly_generator(self):
        """Mock plotly chart generator."""
        gen = MagicMock()
        gen.generate.return_value = {"data": [], "layout": {}}
        return gen

    @pytest.fixture
    def chart_tool_registry(self, sqlite_runner, mock_plotly_generator):
        """Registry with both tools, using a trackable plotly generator."""
        registry = ToolRegistry()
        registry.register_local_tool(
            RunSqlTool(sql_runner=sqlite_runner),
            access_groups=["admin", "user"],
        )
        registry.register_local_tool(
            VisualizeDataTool(plotly_generator=mock_plotly_generator),
            access_groups=["admin", "user"],
        )
        return registry

    @pytest.fixture
    def chart_agent(self, chart_tool_registry, demo_memory):
        """Agent that will receive LLM responses requesting chart generation."""
        llm = MagicMock(spec=LlmService)

        # Step 1: LLM calls run_sql
        sql_response = LlmResponse(
            content=None,
            tool_calls=[
                ToolCall(
                    id="call-sql",
                    name="run_sql",
                    arguments={
                        "sql": "SELECT sector, COUNT(*) as cnt FROM companies GROUP BY sector"
                    },
                )
            ],
            finish_reason="tool_use",
        )

        # Step 2: LLM calls visualize_data with the CSV filename
        chart_response = LlmResponse(
            content=None,
            tool_calls=[
                ToolCall(
                    id="call-chart",
                    name="visualize_data",
                    arguments={
                        "data_filename": "query_results_test.csv",
                        "chart_instructions": "Bar chart of companies per sector",
                    },
                )
            ],
            finish_reason="tool_use",
        )

        # Step 3: LLM returns final text
        text_response = LlmResponse(
            content="Here is the chart showing companies per sector.",
            tool_calls=None,
            finish_reason="end_turn",
        )

        llm.send_request = AsyncMock(
            side_effect=[sql_response, chart_response, text_response]
        )
        llm.validate_tools = MagicMock(return_value=[])

        return Agent(
            llm_service=llm,
            tool_registry=chart_tool_registry,
            user_resolver=MockUserResolver(),
            agent_memory=demo_memory,
            config=AgentConfig(
                stream_responses=False,
                max_tool_iterations=10,
            ),
        )

    @pytest.mark.asyncio
    async def test_chart_pipeline_calls_visualize_tool(self, chart_agent):
        """Agent should invoke VisualizeDataTool when LLM requests it."""
        request_ctx = RequestContext(headers={}, cookies={})
        components = []
        async for component in chart_agent.send_message(
            request_ctx, "Show a chart of companies by sector"
        ):
            components.append(component)

        # LLM should be called 3 times (sql, chart, final text)
        assert chart_agent.llm_service.send_request.call_count == 3
        assert len(components) > 0


# ===========================================================================
# Test: Error handling in the pipeline
# ===========================================================================


class TestPipelineErrorHandling:
    """Test that the pipeline handles errors gracefully."""

    @pytest.mark.asyncio
    async def test_pipeline_handles_bad_sql_from_llm(
        self, tool_registry, demo_memory
    ):
        """When LLM generates invalid SQL, the error is captured and
        sent back to the LLM for a corrective response."""
        llm = MagicMock(spec=LlmService)

        # LLM returns bad SQL
        bad_sql_response = LlmResponse(
            content=None,
            tool_calls=[
                ToolCall(
                    id="call-bad",
                    name="run_sql",
                    arguments={"sql": "SELECTT * FROOM companies"},
                )
            ],
            finish_reason="tool_use",
        )

        # After getting the error, LLM apologizes
        apology_response = LlmResponse(
            content="I apologize, there was an error with the SQL query.",
            tool_calls=None,
            finish_reason="end_turn",
        )

        llm.send_request = AsyncMock(
            side_effect=[bad_sql_response, apology_response]
        )
        llm.validate_tools = MagicMock(return_value=[])

        agent = Agent(
            llm_service=llm,
            tool_registry=tool_registry,
            user_resolver=MockUserResolver(),
            agent_memory=demo_memory,
            config=AgentConfig(stream_responses=False, max_tool_iterations=5),
        )

        request_ctx = RequestContext(headers={}, cookies={})
        components = []
        async for component in agent.send_message(
            request_ctx, "Show all companies"
        ):
            components.append(component)

        # Pipeline should not crash -- LLM gets the error and responds
        assert llm.send_request.call_count == 2
        assert len(components) > 0

    @pytest.mark.asyncio
    async def test_pipeline_handles_empty_results(
        self, tool_registry, demo_memory
    ):
        """Pipeline handles SQL that returns zero rows gracefully."""
        llm = MagicMock(spec=LlmService)

        # LLM returns SQL that matches nothing
        empty_response = LlmResponse(
            content=None,
            tool_calls=[
                ToolCall(
                    id="call-empty",
                    name="run_sql",
                    arguments={
                        "sql": "SELECT * FROM companies WHERE ticker = 'NONEXISTENT'"
                    },
                )
            ],
            finish_reason="tool_use",
        )

        # LLM reports no results
        text_response = LlmResponse(
            content="No companies matched your query.",
            tool_calls=None,
            finish_reason="end_turn",
        )

        llm.send_request = AsyncMock(
            side_effect=[empty_response, text_response]
        )
        llm.validate_tools = MagicMock(return_value=[])

        agent = Agent(
            llm_service=llm,
            tool_registry=tool_registry,
            user_resolver=MockUserResolver(),
            agent_memory=demo_memory,
            config=AgentConfig(stream_responses=False, max_tool_iterations=5),
        )

        request_ctx = RequestContext(headers={}, cookies={})
        components = []
        async for component in agent.send_message(
            request_ctx, "Find ticker NONEXISTENT"
        ):
            components.append(component)

        assert llm.send_request.call_count == 2
        assert len(components) > 0

    @pytest.mark.asyncio
    async def test_pipeline_respects_max_tool_iterations(
        self, tool_registry, demo_memory
    ):
        """Agent stops after max_tool_iterations to prevent infinite loops."""
        llm = MagicMock(spec=LlmService)

        # LLM keeps requesting tool calls indefinitely
        infinite_tool_call = LlmResponse(
            content=None,
            tool_calls=[
                ToolCall(
                    id="call-loop",
                    name="run_sql",
                    arguments={"sql": "SELECT 1"},
                )
            ],
            finish_reason="tool_use",
        )

        llm.send_request = AsyncMock(return_value=infinite_tool_call)
        llm.validate_tools = MagicMock(return_value=[])

        agent = Agent(
            llm_service=llm,
            tool_registry=tool_registry,
            user_resolver=MockUserResolver(),
            agent_memory=demo_memory,
            config=AgentConfig(
                stream_responses=False,
                max_tool_iterations=3,
            ),
        )

        request_ctx = RequestContext(headers={}, cookies={})
        components = []
        async for component in agent.send_message(
            request_ctx, "Keep querying"
        ):
            components.append(component)

        # Should stop after max_tool_iterations (3) + 1 final call
        assert llm.send_request.call_count <= 4
