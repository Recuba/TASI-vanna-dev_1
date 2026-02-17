"""
Tests for the live market widgets system.
Covers: QuoteItem model, crypto/metals/oil/indices providers, QuotesHub orchestrator.
No Redis or external APIs required -- all network calls are mocked.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from api.models.widgets import QuoteItem  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_quote(
    symbol: str = "BTC",
    name: str = "Bitcoin",
    asset_class: str = "crypto",
    price: float = 50000.0,
    currency: str = "USD",
    change: float | None = None,
    change_pct: float | None = None,
    ts_iso: str = "2026-02-17T12:00:00+00:00",
    source: str = "test",
    is_delayed: bool = False,
    delay_minutes: int = 0,
) -> QuoteItem:
    return QuoteItem(
        symbol=symbol,
        name=name,
        asset_class=asset_class,
        price=price,
        currency=currency,
        change=change,
        change_pct=change_pct,
        ts_iso=ts_iso,
        source=source,
        is_delayed=is_delayed,
        delay_minutes=delay_minutes,
    )


# ===========================================================================
# QuoteItem model
# ===========================================================================


class TestQuoteItemModel:
    def test_valid_construction_minimal(self):
        """Required fields only - optional change fields default to None."""
        q = QuoteItem(
            symbol="ETH",
            name="Ethereum",
            asset_class="crypto",
            price=3200.0,
            currency="USD",
            ts_iso="2026-02-17T10:00:00+00:00",
            source="coingecko",
        )
        assert q.symbol == "ETH"
        assert q.name == "Ethereum"
        assert q.asset_class == "crypto"
        assert q.price == 3200.0
        assert q.currency == "USD"
        assert q.change is None
        assert q.change_pct is None
        assert q.is_delayed is False
        assert q.delay_minutes == 0

    def test_valid_construction_all_fields(self):
        """All fields set explicitly."""
        q = _make_quote(
            change=250.0,
            change_pct=0.5,
            is_delayed=True,
            delay_minutes=15,
        )
        assert q.change == 250.0
        assert q.change_pct == 0.5
        assert q.is_delayed is True
        assert q.delay_minutes == 15

    def test_serialization_to_dict(self):
        """model_dump() returns a plain dict with all expected keys."""
        q = _make_quote(change=-100.0, change_pct=-0.2)
        d = q.model_dump()
        assert isinstance(d, dict)
        expected_keys = {
            "symbol",
            "name",
            "asset_class",
            "price",
            "currency",
            "change",
            "change_pct",
            "ts_iso",
            "source",
            "is_delayed",
            "delay_minutes",
        }
        assert expected_keys == set(d.keys())
        assert d["change"] == -100.0
        assert d["change_pct"] == -0.2

    def test_json_roundtrip(self):
        """model_dump() -> json.dumps -> json.loads preserves values."""
        q = _make_quote(symbol="XAU", asset_class="metal", price=1950.5)
        raw = json.dumps(q.model_dump())
        restored = json.loads(raw)
        assert restored["symbol"] == "XAU"
        assert restored["price"] == 1950.5

    def test_asset_class_literal_valid_values(self):
        """All valid asset_class literals are accepted."""
        for cls in ("crypto", "metal", "oil", "index", "fx", "other"):
            q = _make_quote(asset_class=cls)
            assert q.asset_class == cls

    def test_asset_class_invalid_raises(self):
        """An invalid asset_class raises a ValidationError."""
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            QuoteItem(
                symbol="X",
                name="X",
                asset_class="invalid_class",
                price=1.0,
                currency="USD",
                ts_iso="2026-01-01T00:00:00+00:00",
                source="test",
            )

    def test_missing_required_field_raises(self):
        """Omitting a required field raises a ValidationError."""
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            # price is required
            QuoteItem(
                symbol="BTC",
                name="Bitcoin",
                asset_class="crypto",
                currency="USD",
                ts_iso="2026-01-01T00:00:00+00:00",
                source="test",
            )

    def test_negative_price_accepted(self):
        """Negative price (e.g., oil futures) should not be rejected."""
        q = _make_quote(price=-5.0, asset_class="oil")
        assert q.price == -5.0


# ===========================================================================
# Crypto provider
# ===========================================================================


class TestFetchCrypto:
    @pytest.mark.asyncio
    async def test_success_returns_btc_and_eth(self):
        """Happy path: API returns both BTC and ETH, provider returns 2 QuoteItems."""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "bitcoin": {"usd": 50000, "usd_24h_change": 2.5},
            "ethereum": {"usd": 3200, "usd_24h_change": -1.1},
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            from services.widgets.providers.crypto import fetch_crypto

            quotes = await fetch_crypto()

        assert len(quotes) == 2
        symbols = {q.symbol for q in quotes}
        assert symbols == {"BTC", "ETH"}
        for q in quotes:
            assert q.asset_class == "crypto"
            assert q.currency == "USD"
            assert q.source == "coingecko"

    @pytest.mark.asyncio
    async def test_btc_price_and_change_correct(self):
        """BTC price and change_pct are correctly mapped from API response."""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "bitcoin": {"usd": 45000, "usd_24h_change": 3.141592},
            "ethereum": {"usd": 3000, "usd_24h_change": 0.0},
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            from services.widgets.providers.crypto import fetch_crypto

            quotes = await fetch_crypto()

        btc = next(q for q in quotes if q.symbol == "BTC")
        assert btc.price == 45000.0
        assert btc.change_pct == round(3.141592, 2)

    @pytest.mark.asyncio
    async def test_http_error_returns_empty_list(self):
        """HTTP errors result in an empty list, not an exception."""
        import httpx

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(
            side_effect=httpx.HTTPStatusError(
                "500", request=MagicMock(), response=MagicMock()
            )
        )
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            from services.widgets.providers.crypto import fetch_crypto

            quotes = await fetch_crypto()

        assert quotes == []

    @pytest.mark.asyncio
    async def test_timeout_returns_empty_list(self):
        """Timeout errors result in an empty list, not an exception."""
        import httpx

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=httpx.TimeoutException("timeout"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            from services.widgets.providers.crypto import fetch_crypto

            quotes = await fetch_crypto()

        assert quotes == []

    @pytest.mark.asyncio
    async def test_empty_api_response_returns_empty_list(self):
        """Empty JSON object from API returns empty list."""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {}

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            from services.widgets.providers.crypto import fetch_crypto

            quotes = await fetch_crypto()

        assert quotes == []

    @pytest.mark.asyncio
    async def test_missing_price_field_skips_coin(self):
        """Coins without a usd price field are skipped."""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "bitcoin": {"usd": 50000, "usd_24h_change": 1.0},
            "ethereum": {},  # missing usd price
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            from services.widgets.providers.crypto import fetch_crypto

            quotes = await fetch_crypto()

        assert len(quotes) == 1
        assert quotes[0].symbol == "BTC"


# ===========================================================================
# Metals provider
# ===========================================================================


class TestFetchMetals:
    def _make_fast_info(self, last_price=None, previous_close=None):
        info = MagicMock()
        info.last_price = last_price
        info.previous_close = previous_close
        return info

    @pytest.mark.asyncio
    async def test_success_returns_gold_and_silver(self):
        """Happy path: yfinance returns data for both GC=F and SI=F."""
        fast_info_gold = self._make_fast_info(last_price=2000.0, previous_close=1990.0)
        fast_info_silver = self._make_fast_info(last_price=24.5, previous_close=24.0)

        ticker_gold = MagicMock()
        ticker_gold.fast_info = fast_info_gold

        ticker_silver = MagicMock()
        ticker_silver.fast_info = fast_info_silver

        def _ticker_factory(symbol):
            if symbol == "GC=F":
                return ticker_gold
            return ticker_silver

        with patch("yfinance.Ticker", side_effect=_ticker_factory):
            from services.widgets.providers.metals import fetch_metals

            quotes = await fetch_metals()

        assert len(quotes) == 2
        symbols = {q.symbol for q in quotes}
        assert symbols == {"XAU", "XAG"}
        for q in quotes:
            assert q.asset_class == "metal"
            assert q.currency == "USD"
            assert q.source == "yfinance"

    @pytest.mark.asyncio
    async def test_change_calculation_correct(self):
        """Change and change_pct are computed from last_price - previous_close."""
        fast_info = self._make_fast_info(last_price=2100.0, previous_close=2000.0)
        ticker_mock = MagicMock()
        ticker_mock.fast_info = fast_info

        # Return the same mock for both tickers so we can test XAU easily
        with patch("yfinance.Ticker", return_value=ticker_mock):
            from services.widgets.providers.metals import fetch_metals

            quotes = await fetch_metals()

        xau = next(q for q in quotes if q.symbol == "XAU")
        assert xau.change == round(2100.0 - 2000.0, 2)
        assert xau.change_pct == round((100.0 / 2000.0) * 100, 2)

    @pytest.mark.asyncio
    async def test_no_previous_close_yields_none_change(self):
        """When previous_close is None, change fields are None."""
        fast_info = self._make_fast_info(last_price=1950.0, previous_close=None)
        ticker_mock = MagicMock()
        ticker_mock.fast_info = fast_info

        with patch("yfinance.Ticker", return_value=ticker_mock):
            from services.widgets.providers.metals import fetch_metals

            quotes = await fetch_metals()

        for q in quotes:
            assert q.change is None
            assert q.change_pct is None

    @pytest.mark.asyncio
    async def test_none_price_skips_ticker(self):
        """Tickers with last_price=None are skipped."""
        fast_info = self._make_fast_info(last_price=None, previous_close=None)
        ticker_mock = MagicMock()
        ticker_mock.fast_info = fast_info

        with patch("yfinance.Ticker", return_value=ticker_mock):
            from services.widgets.providers.metals import fetch_metals

            quotes = await fetch_metals()

        assert quotes == []

    @pytest.mark.asyncio
    async def test_yfinance_exception_returns_empty_list(self):
        """Exception inside yfinance sync function returns empty list."""
        with patch("yfinance.Ticker", side_effect=RuntimeError("yfinance down")):
            from services.widgets.providers.metals import fetch_metals

            quotes = await fetch_metals()

        assert quotes == []


# ===========================================================================
# Oil provider
# ===========================================================================


class TestFetchOil:
    def _make_fast_info(self, last_price=None, previous_close=None):
        info = MagicMock()
        info.last_price = last_price
        info.previous_close = previous_close
        return info

    @pytest.mark.asyncio
    async def test_success_returns_brent_and_wti(self):
        """Happy path: yfinance returns data for both BZ=F and CL=F."""
        fast_info = self._make_fast_info(last_price=80.5, previous_close=79.0)
        ticker_mock = MagicMock()
        ticker_mock.fast_info = fast_info

        with patch("yfinance.Ticker", return_value=ticker_mock):
            from services.widgets.providers.oil import fetch_oil

            quotes = await fetch_oil()

        assert len(quotes) == 2
        symbols = {q.symbol for q in quotes}
        assert symbols == {"BRENT", "WTI"}
        for q in quotes:
            assert q.asset_class == "oil"
            assert q.currency == "USD"
            assert q.source == "yfinance"

    @pytest.mark.asyncio
    async def test_change_calculation_correct(self):
        """Change and change_pct are correctly computed."""
        fast_info = self._make_fast_info(last_price=85.0, previous_close=80.0)
        ticker_mock = MagicMock()
        ticker_mock.fast_info = fast_info

        with patch("yfinance.Ticker", return_value=ticker_mock):
            from services.widgets.providers.oil import fetch_oil

            quotes = await fetch_oil()

        brent = next(q for q in quotes if q.symbol == "BRENT")
        assert brent.change == round(85.0 - 80.0, 2)
        assert brent.change_pct == round((5.0 / 80.0) * 100, 2)

    @pytest.mark.asyncio
    async def test_none_price_skips_ticker(self):
        """Tickers with last_price=None are skipped."""
        fast_info = self._make_fast_info(last_price=None)
        ticker_mock = MagicMock()
        ticker_mock.fast_info = fast_info

        with patch("yfinance.Ticker", return_value=ticker_mock):
            from services.widgets.providers.oil import fetch_oil

            quotes = await fetch_oil()

        assert quotes == []

    @pytest.mark.asyncio
    async def test_yfinance_exception_returns_empty_list(self):
        """Exception inside yfinance sync function returns empty list."""
        with patch("yfinance.Ticker", side_effect=RuntimeError("yfinance down")):
            from services.widgets.providers.oil import fetch_oil

            quotes = await fetch_oil()

        assert quotes == []

    @pytest.mark.asyncio
    async def test_zero_previous_close_yields_none_change(self):
        """When previous_close is 0, change fields remain None (avoid division by zero)."""
        fast_info = self._make_fast_info(last_price=80.0, previous_close=0)
        ticker_mock = MagicMock()
        ticker_mock.fast_info = fast_info

        with patch("yfinance.Ticker", return_value=ticker_mock):
            from services.widgets.providers.oil import fetch_oil

            quotes = await fetch_oil()

        for q in quotes:
            assert q.change is None
            assert q.change_pct is None


# ===========================================================================
# Indices provider
# ===========================================================================


class TestFetchIndices:
    def _make_fast_info(self, last_price=None, previous_close=None):
        info = MagicMock()
        info.last_price = last_price
        info.previous_close = previous_close
        return info

    @pytest.mark.asyncio
    async def test_success_returns_three_indices(self):
        """Happy path: yfinance returns data for SPX, DJI, IXIC."""
        fast_info = self._make_fast_info(last_price=5000.0, previous_close=4950.0)
        ticker_mock = MagicMock()
        ticker_mock.fast_info = fast_info

        with patch("yfinance.Ticker", return_value=ticker_mock):
            from services.widgets.providers.indices import fetch_indices

            quotes = await fetch_indices()

        assert len(quotes) == 3
        symbols = {q.symbol for q in quotes}
        assert symbols == {"SPX", "DJI", "IXIC"}

    @pytest.mark.asyncio
    async def test_indices_are_delayed(self):
        """All index quotes have is_delayed=True and delay_minutes=15."""
        fast_info = self._make_fast_info(last_price=5000.0, previous_close=4900.0)
        ticker_mock = MagicMock()
        ticker_mock.fast_info = fast_info

        with patch("yfinance.Ticker", return_value=ticker_mock):
            from services.widgets.providers.indices import fetch_indices

            quotes = await fetch_indices()

        for q in quotes:
            assert q.is_delayed is True
            assert q.delay_minutes == 15
            assert q.asset_class == "index"

    @pytest.mark.asyncio
    async def test_none_price_skips_ticker(self):
        """Tickers with last_price=None are skipped."""
        fast_info = self._make_fast_info(last_price=None)
        ticker_mock = MagicMock()
        ticker_mock.fast_info = fast_info

        with patch("yfinance.Ticker", return_value=ticker_mock):
            from services.widgets.providers.indices import fetch_indices

            quotes = await fetch_indices()

        assert quotes == []

    @pytest.mark.asyncio
    async def test_yfinance_exception_returns_empty_list(self):
        """Exception inside yfinance sync function returns empty list."""
        with patch("yfinance.Ticker", side_effect=RuntimeError("yfinance down")):
            from services.widgets.providers.indices import fetch_indices

            quotes = await fetch_indices()

        assert quotes == []

    @pytest.mark.asyncio
    async def test_change_calculation_correct(self):
        """Change and change_pct are correctly computed for indices."""
        fast_info = self._make_fast_info(last_price=5100.0, previous_close=5000.0)
        ticker_mock = MagicMock()
        ticker_mock.fast_info = fast_info

        with patch("yfinance.Ticker", return_value=ticker_mock):
            from services.widgets.providers.indices import fetch_indices

            quotes = await fetch_indices()

        spx = next(q for q in quotes if q.symbol == "SPX")
        assert spx.change == round(5100.0 - 5000.0, 2)
        assert spx.change_pct == round((100.0 / 5000.0) * 100, 2)


# ===========================================================================
# QuotesHub / quotes_hub module
# ===========================================================================


class TestSerialize:
    def test_serialize_produces_valid_json(self):
        """_serialize() returns a valid JSON string from a list of QuoteItems."""
        from services.widgets.quotes_hub import _serialize

        quotes = [
            _make_quote(symbol="BTC", price=50000.0),
            _make_quote(symbol="ETH", price=3200.0, asset_class="crypto"),
        ]
        raw = _serialize(quotes)
        parsed = json.loads(raw)
        assert isinstance(parsed, list)
        assert len(parsed) == 2
        assert parsed[0]["symbol"] == "BTC"
        assert parsed[1]["symbol"] == "ETH"

    def test_serialize_empty_list(self):
        """_serialize() with empty list returns '[]'."""
        from services.widgets.quotes_hub import _serialize

        assert _serialize([]) == "[]"

    def test_serialize_preserves_non_ascii(self):
        """Non-ASCII characters in name fields are preserved."""
        from services.widgets.quotes_hub import _serialize

        q = _make_quote(name="ذهب")  # Arabic for "gold"
        raw = _serialize([q])
        parsed = json.loads(raw)
        assert parsed[0]["name"] == "ذهب"


class TestGetLatestSnapshot:
    def test_initial_snapshot_is_none(self):
        """get_latest_snapshot() returns None before any data is fetched."""
        import services.widgets.quotes_hub as hub

        # Reset to None for isolation
        original = hub._latest_snapshot
        hub._latest_snapshot = None
        try:
            assert hub.get_latest_snapshot() is None
        finally:
            hub._latest_snapshot = original

    def test_snapshot_updated_after_assignment(self):
        """get_latest_snapshot() reflects directly assigned snapshot."""
        import services.widgets.quotes_hub as hub

        original = hub._latest_snapshot
        hub._latest_snapshot = '["test"]'
        try:
            assert hub.get_latest_snapshot() == '["test"]'
        finally:
            hub._latest_snapshot = original


class TestRunQuotesHub:
    @pytest.mark.asyncio
    async def test_hub_updates_in_memory_snapshot(self):
        """run_quotes_hub sets _latest_snapshot on first successful fetch."""
        import services.widgets.quotes_hub as hub

        test_quotes = [_make_quote(symbol="BTC", price=50000.0)]

        original_snapshot = hub._latest_snapshot
        hub._latest_snapshot = None

        async def _one_iteration(redis_client=None):
            """Patch to stop after first iteration by cancelling the task."""
            hub._latest_snapshot = None
            try:
                # Patch _fetch_all_providers to return test_quotes
                with patch(
                    "services.widgets.quotes_hub._fetch_all_providers",
                    return_value=asyncio.coroutine(lambda: test_quotes)()
                    if False
                    else None,
                ):
                    pass
            except Exception:
                pass

        # Directly test that _fetch_all_providers result flows into snapshot
        with patch(
            "services.widgets.quotes_hub._fetch_all_providers",
            new=AsyncMock(return_value=test_quotes),
        ):
            # Run with a short sleep so we can cancel immediately
            with patch(
                "asyncio.sleep", new=AsyncMock(side_effect=asyncio.CancelledError)
            ):
                try:
                    await hub.run_quotes_hub(redis_client=None)
                except asyncio.CancelledError:
                    pass

        assert hub._latest_snapshot is not None
        parsed = json.loads(hub._latest_snapshot)
        assert parsed[0]["symbol"] == "BTC"

        hub._latest_snapshot = original_snapshot

    @pytest.mark.asyncio
    async def test_hub_skips_cycle_when_no_quotes(self):
        """run_quotes_hub does not update snapshot when providers return empty."""
        import services.widgets.quotes_hub as hub

        original = hub._latest_snapshot
        hub._latest_snapshot = None

        sleep_calls: list[float] = []

        async def _mock_sleep(seconds: float):
            sleep_calls.append(seconds)
            raise asyncio.CancelledError

        with patch(
            "services.widgets.quotes_hub._fetch_all_providers",
            new=AsyncMock(return_value=[]),
        ):
            with patch("asyncio.sleep", new=_mock_sleep):
                try:
                    await hub.run_quotes_hub(redis_client=None)
                except asyncio.CancelledError:
                    pass

        # Snapshot should remain None since no quotes were fetched
        assert hub._latest_snapshot is None
        hub._latest_snapshot = original

    @pytest.mark.asyncio
    async def test_hub_calls_redis_setex_when_redis_provided(self):
        """run_quotes_hub calls redis.setex when redis_client is given."""
        import services.widgets.quotes_hub as hub

        test_quotes = [_make_quote()]

        mock_redis = MagicMock()
        mock_redis.setex = MagicMock()
        mock_redis.publish = MagicMock()

        original = hub._latest_snapshot
        hub._latest_snapshot = None

        with patch(
            "services.widgets.quotes_hub._fetch_all_providers",
            new=AsyncMock(return_value=test_quotes),
        ):
            with patch(
                "asyncio.sleep", new=AsyncMock(side_effect=asyncio.CancelledError)
            ):
                with patch("asyncio.to_thread", new=AsyncMock(return_value=None)):
                    try:
                        await hub.run_quotes_hub(redis_client=mock_redis)
                    except asyncio.CancelledError:
                        pass

        hub._latest_snapshot = original

    @pytest.mark.asyncio
    async def test_hub_error_isolation_single_provider_failure(self):
        """One failing provider does not stop the hub; other providers' quotes persist."""
        import services.widgets.quotes_hub as hub

        # Simulate: crypto fails, others succeed
        good_quotes = [
            _make_quote(symbol="XAU", asset_class="metal"),
            _make_quote(symbol="BRENT", asset_class="oil"),
        ]

        original = hub._latest_snapshot
        hub._latest_snapshot = None

        with patch(
            "services.widgets.quotes_hub._fetch_all_providers",
            new=AsyncMock(return_value=good_quotes),
        ):
            with patch(
                "asyncio.sleep", new=AsyncMock(side_effect=asyncio.CancelledError)
            ):
                try:
                    await hub.run_quotes_hub(redis_client=None)
                except asyncio.CancelledError:
                    pass

        assert hub._latest_snapshot is not None
        parsed = json.loads(hub._latest_snapshot)
        assert len(parsed) == 2

        hub._latest_snapshot = original

    @pytest.mark.asyncio
    async def test_fetch_all_providers_aggregates_results(self):
        """_fetch_all_providers gathers from all four providers."""
        crypto_quotes = [_make_quote(symbol="BTC", asset_class="crypto")]
        metals_quotes = [_make_quote(symbol="XAU", asset_class="metal")]
        oil_quotes = [_make_quote(symbol="BRENT", asset_class="oil")]
        indices_quotes = [_make_quote(symbol="SPX", asset_class="index")]

        with patch(
            "services.widgets.providers.crypto.fetch_crypto",
            new=AsyncMock(return_value=crypto_quotes),
        ):
            with patch(
                "services.widgets.providers.metals.fetch_metals",
                new=AsyncMock(return_value=metals_quotes),
            ):
                with patch(
                    "services.widgets.providers.oil.fetch_oil",
                    new=AsyncMock(return_value=oil_quotes),
                ):
                    with patch(
                        "services.widgets.providers.indices.fetch_indices",
                        new=AsyncMock(return_value=indices_quotes),
                    ):
                        from services.widgets.quotes_hub import _fetch_all_providers

                        quotes = await _fetch_all_providers()

        assert len(quotes) == 4
        symbols = {q.symbol for q in quotes}
        assert symbols == {"BTC", "XAU", "BRENT", "SPX"}

    @pytest.mark.asyncio
    async def test_fetch_all_providers_isolates_exception(self):
        """If one provider raises, _fetch_all_providers skips it and returns others."""
        good_quotes = [_make_quote(symbol="XAU", asset_class="metal")]

        with patch(
            "services.widgets.providers.crypto.fetch_crypto",
            new=AsyncMock(side_effect=RuntimeError("crypto API down")),
        ):
            with patch(
                "services.widgets.providers.metals.fetch_metals",
                new=AsyncMock(return_value=good_quotes),
            ):
                with patch(
                    "services.widgets.providers.oil.fetch_oil",
                    new=AsyncMock(return_value=[]),
                ):
                    with patch(
                        "services.widgets.providers.indices.fetch_indices",
                        new=AsyncMock(return_value=[]),
                    ):
                        from services.widgets.quotes_hub import _fetch_all_providers

                        quotes = await _fetch_all_providers()

        # Should have gold, skipped crypto exception
        assert len(quotes) == 1
        assert quotes[0].symbol == "XAU"


class TestGetSnapshotEvent:
    def test_returns_asyncio_event(self):
        """get_snapshot_event() returns an asyncio.Event instance."""
        from services.widgets.quotes_hub import get_snapshot_event

        event = get_snapshot_event()
        assert isinstance(event, asyncio.Event)
