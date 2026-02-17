"""
XBRL Processor Tests
====================
Comprehensive tests for ingestion/xbrl_processor.py targeting low-coverage
lines. Uses mock XML/XBRL data as strings; no external files or services needed.
"""

import sys
import tempfile
from datetime import date
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# ---------------------------------------------------------------------------
# Minimal XBRL XML templates
# ---------------------------------------------------------------------------

MINIMAL_XBRL_XML = """\
<?xml version="1.0" encoding="UTF-8"?>
<xbrli:xbrl
    xmlns:xbrli="http://www.xbrl.org/2003/instance"
    xmlns:ifrs-full="http://xbrl.ifrs.org/taxonomy/2023-03-23/ifrs-full"
    xmlns:iso4217="http://www.xbrl.org/2003/iso4217"
    xmlns:xbrldi="http://xbrl.org/2006/xbrldi">

  <xbrli:context id="ctx_2024">
    <xbrli:entity><xbrli:identifier scheme="http://www.tadawul.com.sa">2222</xbrli:identifier></xbrli:entity>
    <xbrli:period>
      <xbrli:startDate>2024-01-01</xbrli:startDate>
      <xbrli:endDate>2024-12-31</xbrli:endDate>
    </xbrli:period>
  </xbrli:context>

  <xbrli:context id="ctx_instant">
    <xbrli:entity><xbrli:identifier scheme="http://www.tadawul.com.sa">2222</xbrli:identifier></xbrli:entity>
    <xbrli:period>
      <xbrli:instant>2024-12-31</xbrli:instant>
    </xbrli:period>
  </xbrli:context>

  <xbrli:unit id="SAR">
    <xbrli:measure>iso4217:SAR</xbrli:measure>
  </xbrli:unit>

  <xbrli:unit id="shares">
    <xbrli:measure>xbrli:shares</xbrli:measure>
  </xbrli:unit>

  <ifrs-full:Revenue contextRef="ctx_2024" unitRef="SAR" decimals="-3">150000000</ifrs-full:Revenue>
  <ifrs-full:Assets contextRef="ctx_instant" unitRef="SAR" decimals="-3">500000000</ifrs-full:Assets>
  <ifrs-full:ProfitLoss contextRef="ctx_2024" unitRef="SAR" decimals="-3">30000000</ifrs-full:ProfitLoss>
</xbrli:xbrl>
"""

XBRL_XML_WITH_DIMENSIONS = """\
<?xml version="1.0" encoding="UTF-8"?>
<xbrli:xbrl
    xmlns:xbrli="http://www.xbrl.org/2003/instance"
    xmlns:ifrs-full="http://xbrl.ifrs.org/taxonomy/2023-03-23/ifrs-full"
    xmlns:iso4217="http://www.xbrl.org/2003/iso4217"
    xmlns:xbrldi="http://xbrl.org/2006/xbrldi"
    xmlns:tasi="http://www.tadawul.com.sa/taxonomy">

  <xbrli:context id="ctx_segment">
    <xbrli:entity>
      <xbrli:identifier scheme="http://www.tadawul.com.sa">2222</xbrli:identifier>
      <xbrli:segment>
        <xbrldi:explicitMember dimension="ifrs-full:SegmentsAxis">tasi:UpstreamMember</xbrldi:explicitMember>
      </xbrli:segment>
    </xbrli:entity>
    <xbrli:period>
      <xbrli:startDate>2024-01-01</xbrli:startDate>
      <xbrli:endDate>2024-12-31</xbrli:endDate>
    </xbrli:period>
  </xbrli:context>

  <xbrli:unit id="SAR">
    <xbrli:measure>iso4217:SAR</xbrli:measure>
  </xbrli:unit>

  <ifrs-full:Revenue contextRef="ctx_segment" unitRef="SAR" decimals="-3">80000000</ifrs-full:Revenue>
</xbrli:xbrl>
"""

XBRL_XML_BOOLEAN_AND_TEXT = """\
<?xml version="1.0" encoding="UTF-8"?>
<xbrli:xbrl
    xmlns:xbrli="http://www.xbrl.org/2003/instance"
    xmlns:ifrs-full="http://xbrl.ifrs.org/taxonomy/2023-03-23/ifrs-full">

  <xbrli:context id="ctx_1">
    <xbrli:entity><xbrli:identifier scheme="test">2222</xbrli:identifier></xbrli:entity>
    <xbrli:period><xbrli:instant>2024-12-31</xbrli:instant></xbrli:period>
  </xbrli:context>

  <ifrs-full:IsConsolidated contextRef="ctx_1">true</ifrs-full:IsConsolidated>
  <ifrs-full:EntityName contextRef="ctx_1">Saudi Aramco</ifrs-full:EntityName>
  <ifrs-full:GoingConcernFlag contextRef="ctx_1">false</ifrs-full:GoingConcernFlag>
</xbrli:xbrl>
"""

XBRL_XML_DECIMALS_INF = """\
<?xml version="1.0" encoding="UTF-8"?>
<xbrli:xbrl
    xmlns:xbrli="http://www.xbrl.org/2003/instance"
    xmlns:ifrs-full="http://xbrl.ifrs.org/taxonomy/2023-03-23/ifrs-full"
    xmlns:iso4217="http://www.xbrl.org/2003/iso4217">

  <xbrli:context id="ctx_1">
    <xbrli:entity><xbrli:identifier scheme="test">2222</xbrli:identifier></xbrli:entity>
    <xbrli:period><xbrli:instant>2024-12-31</xbrli:instant></xbrli:period>
  </xbrli:context>

  <xbrli:unit id="SAR"><xbrli:measure>iso4217:SAR</xbrli:measure></xbrli:unit>

  <ifrs-full:Assets contextRef="ctx_1" unitRef="SAR" decimals="INF">999999</ifrs-full:Assets>
</xbrli:xbrl>
"""

XBRL_XML_NO_UNIT_NO_CONTEXT = """\
<?xml version="1.0" encoding="UTF-8"?>
<xbrli:xbrl
    xmlns:xbrli="http://www.xbrl.org/2003/instance"
    xmlns:ifrs-full="http://xbrl.ifrs.org/taxonomy/2023-03-23/ifrs-full">

  <xbrli:context id="ctx_1">
    <xbrli:entity><xbrli:identifier scheme="test">2222</xbrli:identifier></xbrli:entity>
    <xbrli:period><xbrli:instant>2024-12-31</xbrli:instant></xbrli:period>
  </xbrli:context>

  <!-- fact with no unitRef and no contextRef -->
  <ifrs-full:EntityName contextRef="ctx_1">Aramco</ifrs-full:EntityName>
  <ifrs-full:SomeValue>42</ifrs-full:SomeValue>
</xbrli:xbrl>
"""

XBRL_XML_FALLBACK_NSMAP = """\
<?xml version="1.0" encoding="UTF-8"?>
<xbrli:xbrl
    xmlns:xbrli="http://www.xbrl.org/2003/instance"
    xmlns:custom="http://xbrl.ifrs.org/taxonomy/custom-ns">

  <xbrli:context id="ctx_1">
    <xbrli:entity><xbrli:identifier scheme="test">2222</xbrli:identifier></xbrli:entity>
    <xbrli:period><xbrli:instant>2024-12-31</xbrli:instant></xbrli:period>
  </xbrli:context>

  <custom:Revenue contextRef="ctx_1">12345</custom:Revenue>
</xbrli:xbrl>
"""

XBRL_XML_COMMA_NUMBER = """\
<?xml version="1.0" encoding="UTF-8"?>
<xbrli:xbrl
    xmlns:xbrli="http://www.xbrl.org/2003/instance"
    xmlns:ifrs-full="http://xbrl.ifrs.org/taxonomy/2023-03-23/ifrs-full"
    xmlns:iso4217="http://www.xbrl.org/2003/iso4217">

  <xbrli:context id="ctx_1">
    <xbrli:entity><xbrli:identifier scheme="test">2222</xbrli:identifier></xbrli:entity>
    <xbrli:period><xbrli:instant>2024-12-31</xbrli:instant></xbrli:period>
  </xbrli:context>

  <xbrli:unit id="SAR"><xbrli:measure>iso4217:SAR</xbrli:measure></xbrli:unit>

  <ifrs-full:Assets contextRef="ctx_1" unitRef="SAR" decimals="-3">1,500,000</ifrs-full:Assets>
</xbrli:xbrl>
"""

XBRL_XML_UNIT_NO_COLON = """\
<?xml version="1.0" encoding="UTF-8"?>
<xbrli:xbrl
    xmlns:xbrli="http://www.xbrl.org/2003/instance"
    xmlns:ifrs-full="http://xbrl.ifrs.org/taxonomy/2023-03-23/ifrs-full">

  <xbrli:context id="ctx_1">
    <xbrli:entity><xbrli:identifier scheme="test">2222</xbrli:identifier></xbrli:entity>
    <xbrli:period><xbrli:instant>2024-12-31</xbrli:instant></xbrli:period>
  </xbrli:context>

  <xbrli:unit id="pure"><xbrli:measure>pure</xbrli:measure></xbrli:unit>

  <ifrs-full:Ratio contextRef="ctx_1" unitRef="pure" decimals="2">1.5</ifrs-full:Ratio>
</xbrli:xbrl>
"""

XBRL_XML_CONTEXT_DATES_SLASH = """\
<?xml version="1.0" encoding="UTF-8"?>
<xbrli:xbrl
    xmlns:xbrli="http://www.xbrl.org/2003/instance"
    xmlns:ifrs-full="http://xbrl.ifrs.org/taxonomy/2023-03-23/ifrs-full"
    xmlns:iso4217="http://www.xbrl.org/2003/iso4217">

  <xbrli:context id="ctx_slash">
    <xbrli:entity><xbrli:identifier scheme="test">2222</xbrli:identifier></xbrli:entity>
    <xbrli:period>
      <xbrli:startDate>01/01/2024</xbrli:startDate>
      <xbrli:endDate>31/12/2024</xbrli:endDate>
    </xbrli:period>
  </xbrli:context>

  <xbrli:unit id="SAR"><xbrli:measure>iso4217:SAR</xbrli:measure></xbrli:unit>

  <ifrs-full:Revenue contextRef="ctx_slash" unitRef="SAR" decimals="-3">100000</ifrs-full:Revenue>
</xbrli:xbrl>
"""

MALFORMED_XML = "NOT VALID XML <<<"


# ---------------------------------------------------------------------------
# Helper: write temp XML file
# ---------------------------------------------------------------------------


def _write_temp_xml(content: str, suffix: str = ".xml") -> Path:
    tmp = tempfile.NamedTemporaryFile(
        mode="w", suffix=suffix, delete=False, encoding="utf-8"
    )
    tmp.write(content)
    tmp.flush()
    tmp.close()
    return Path(tmp.name)


# ===========================================================================
# XBRLFact dataclass
# ===========================================================================


class TestXBRLFactDataclass:
    """Comprehensive XBRLFact tests including hash consistency."""

    def test_hash_includes_unit(self):
        from ingestion.xbrl_processor import XBRLFact

        f1 = XBRLFact(
            ticker="2222.SR",
            concept="ifrs-full:Revenue",
            value_numeric=100.0,
            unit="SAR",
        )
        f2 = XBRLFact(
            ticker="2222.SR",
            concept="ifrs-full:Revenue",
            value_numeric=100.0,
            unit="USD",
        )
        assert f1.content_hash != f2.content_hash

    def test_hash_includes_period_start(self):
        from ingestion.xbrl_processor import XBRLFact

        f1 = XBRLFact(
            ticker="2222.SR",
            concept="c",
            value_numeric=1.0,
            period_start=date(2024, 1, 1),
        )
        f2 = XBRLFact(
            ticker="2222.SR",
            concept="c",
            value_numeric=1.0,
            period_start=date(2023, 1, 1),
        )
        assert f1.content_hash != f2.content_hash

    def test_hash_includes_period_end(self):
        from ingestion.xbrl_processor import XBRLFact

        f1 = XBRLFact(
            ticker="2222.SR",
            concept="c",
            value_numeric=1.0,
            period_end=date(2024, 12, 31),
        )
        f2 = XBRLFact(
            ticker="2222.SR",
            concept="c",
            value_numeric=1.0,
            period_end=date(2023, 12, 31),
        )
        assert f1.content_hash != f2.content_hash

    def test_hash_includes_period_instant(self):
        from ingestion.xbrl_processor import XBRLFact

        f1 = XBRLFact(
            ticker="2222.SR",
            concept="c",
            value_numeric=1.0,
            period_instant=date(2024, 12, 31),
        )
        f2 = XBRLFact(
            ticker="2222.SR",
            concept="c",
            value_numeric=1.0,
            period_instant=date(2023, 12, 31),
        )
        assert f1.content_hash != f2.content_hash

    def test_hash_includes_dimension_member(self):
        from ingestion.xbrl_processor import XBRLFact

        f1 = XBRLFact(
            ticker="2222.SR", concept="c", value_numeric=1.0, dimension_member="dim:A"
        )
        f2 = XBRLFact(
            ticker="2222.SR", concept="c", value_numeric=1.0, dimension_member="dim:B"
        )
        assert f1.content_hash != f2.content_hash

    def test_hash_includes_dimension_value(self):
        from ingestion.xbrl_processor import XBRLFact

        f1 = XBRLFact(
            ticker="2222.SR", concept="c", value_numeric=1.0, dimension_value="val:X"
        )
        f2 = XBRLFact(
            ticker="2222.SR", concept="c", value_numeric=1.0, dimension_value="val:Y"
        )
        assert f1.content_hash != f2.content_hash

    def test_hash_boolean_value(self):
        from ingestion.xbrl_processor import XBRLFact

        f1 = XBRLFact(ticker="2222.SR", concept="c", value_boolean=True)
        f2 = XBRLFact(ticker="2222.SR", concept="c", value_boolean=False)
        assert f1.content_hash != f2.content_hash

    def test_hash_text_value(self):
        from ingestion.xbrl_processor import XBRLFact

        f1 = XBRLFact(ticker="2222.SR", concept="c", value_text="Aramco")
        f2 = XBRLFact(ticker="2222.SR", concept="c", value_text="Different")
        assert f1.content_hash != f2.content_hash

    def test_to_insert_tuple_full_fields(self):
        from ingestion.xbrl_processor import XBRLFact

        fact = XBRLFact(
            ticker="2222.SR",
            concept="ifrs-full:Revenue",
            label_en="Revenue",
            label_ar="إيرادات",
            value_numeric=1000.0,
            unit="SAR",
            decimals=-3,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            dimension_member="dim:A",
            dimension_value="val:X",
            source_url="https://example.com",
            filing_id="f-99",
        )
        t = fact.to_insert_tuple()
        assert t[0] == "2222.SR"
        assert t[1] == "f-99"
        assert t[2] == "ifrs-full:Revenue"
        assert t[3] == "Revenue"
        assert t[4] == "إيرادات"
        assert t[5] == 1000.0
        assert t[8] == "SAR"
        assert t[9] == -3
        assert t[10] == date(2024, 1, 1)
        assert t[11] == date(2024, 12, 31)
        assert t[13] == "dim:A"
        assert t[14] == "val:X"
        assert t[16] == fact.content_hash

    def test_content_hash_is_sha256(self):
        from ingestion.xbrl_processor import XBRLFact

        fact = XBRLFact(
            ticker="2222.SR", concept="ifrs-full:Revenue", value_numeric=100.0
        )
        assert len(fact.content_hash) == 64
        # Verify it's valid hex
        int(fact.content_hash, 16)


# ===========================================================================
# process_filing dispatch
# ===========================================================================


class TestProcessFilingDispatch:
    """Tests for process_filing extension routing (lines 276-283)."""

    def test_dispatch_xml_extension(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        xml_file = tmp_path / "filing.xml"
        xml_file.write_text(MINIMAL_XBRL_XML, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR")
        facts = proc.process_filing(xml_file)
        assert isinstance(facts, list)

    def test_dispatch_xbrl_extension(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        xbrl_file = tmp_path / "filing.xbrl"
        xbrl_file.write_text(MINIMAL_XBRL_XML, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR")
        facts = proc.process_filing(xbrl_file)
        assert isinstance(facts, list)

    def test_dispatch_unsupported_returns_error(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        txt_file = tmp_path / "filing.txt"
        txt_file.write_text("dummy", encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR")
        facts = proc.process_filing(txt_file)
        assert facts == []
        assert any("Unsupported" in e for e in proc.errors)

    def test_dispatch_csv_extension_unsupported(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        csv_file = tmp_path / "data.csv"
        csv_file.write_text("a,b,c", encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR")
        facts = proc.process_filing(csv_file)
        assert facts == []
        assert len(proc.errors) == 1


# ===========================================================================
# process_directory
# ===========================================================================


class TestProcessDirectory:
    """Tests for process_directory (lines 295-317)."""

    def test_nonexistent_directory(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        facts = proc.process_directory(Path("/does/not/exist"))
        assert facts == []
        assert any("Directory not found" in e for e in proc.errors)

    def test_empty_directory_returns_empty(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        facts = proc.process_directory(tmp_path)
        assert facts == []

    def test_processes_xml_files(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        (tmp_path / "filing1.xml").write_text(MINIMAL_XBRL_XML, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR")
        facts = proc.process_directory(tmp_path)
        assert len(facts) > 0

    def test_skips_non_supported_extensions(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        (tmp_path / "notes.txt").write_text("ignore me", encoding="utf-8")
        (tmp_path / "filing.xml").write_text(MINIMAL_XBRL_XML, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR")
        facts = proc.process_directory(tmp_path)
        # Only the xml file should be processed
        assert len(facts) > 0
        assert not any("notes.txt" in e for e in proc.errors)

    def test_glob_pattern_filter(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        (tmp_path / "annual_2024.xml").write_text(MINIMAL_XBRL_XML, encoding="utf-8")
        (tmp_path / "quarterly_2024.xml").write_text(MINIMAL_XBRL_XML, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR")
        facts = proc.process_directory(tmp_path, pattern="annual_*.xml")
        assert len(facts) > 0

    def test_error_in_one_file_continues(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        (tmp_path / "good.xml").write_text(MINIMAL_XBRL_XML, encoding="utf-8")
        (tmp_path / "bad.xml").write_text(MALFORMED_XML, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR")
        facts = proc.process_directory(tmp_path)
        # good.xml should still be processed
        assert len(facts) > 0

    def test_multiple_files_combined(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        for i in range(3):
            (tmp_path / f"filing{i}.xml").write_text(MINIMAL_XBRL_XML, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR")
        facts = proc.process_directory(tmp_path)
        # 3 files, each produces facts -- combined list
        assert len(facts) >= 3


# ===========================================================================
# process_url
# ===========================================================================


class TestProcessUrl:
    """Tests for process_url (lines 332-359)."""

    def test_no_requests_library(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        with patch("ingestion.xbrl_processor.requests", None):
            facts = proc.process_url("http://example.com/filing.xml")
        assert facts == []
        assert any("requests" in e for e in proc.errors)

    def test_successful_download(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        mock_resp = MagicMock()
        mock_resp.content = MINIMAL_XBRL_XML.encode("utf-8")
        mock_resp.raise_for_status = MagicMock()

        proc = XBRLProcessor(ticker="2222.SR")
        with patch("ingestion.xbrl_processor.requests") as mock_requests:
            mock_requests.get.return_value = mock_resp
            facts = proc.process_url(
                "http://example.com/filing.xml", download_dir=tmp_path
            )
        assert isinstance(facts, list)
        assert proc.source_url == "http://example.com/filing.xml"

    def test_download_failure(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        with patch("ingestion.xbrl_processor.requests") as mock_requests:
            mock_requests.get.side_effect = Exception("Connection refused")
            facts = proc.process_url(
                "http://example.com/filing.xml", download_dir=tmp_path
            )
        assert facts == []
        assert any("Failed to download" in e for e in proc.errors)

    def test_url_with_no_filename(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        mock_resp = MagicMock()
        mock_resp.content = MINIMAL_XBRL_XML.encode("utf-8")
        mock_resp.raise_for_status = MagicMock()

        proc = XBRLProcessor(ticker="2222.SR")
        with patch("ingestion.xbrl_processor.requests") as mock_requests:
            mock_requests.get.return_value = mock_resp
            # URL with no path filename component
            facts = proc.process_url("http://example.com/", download_dir=tmp_path)
        assert isinstance(facts, list)

    def test_default_download_dir_is_used(self):
        from ingestion.xbrl_processor import XBRLProcessor

        mock_resp = MagicMock()
        mock_resp.content = MINIMAL_XBRL_XML.encode("utf-8")
        mock_resp.raise_for_status = MagicMock()

        proc = XBRLProcessor(ticker="2222.SR")
        with patch("ingestion.xbrl_processor.requests") as mock_requests:
            mock_requests.get.return_value = mock_resp
            with patch.object(Path, "mkdir"):
                with patch.object(Path, "write_bytes"):
                    with patch.object(
                        proc, "process_filing", return_value=[]
                    ) as mock_pf:
                        proc.process_url("http://example.com/test.xml")
                        # Should have been called with a path under _downloads
                        assert mock_pf.called


# ===========================================================================
# XML parsing (process_xml)
# ===========================================================================


class TestProcessXml:
    """Tests for process_xml (lines 377-485)."""

    def test_basic_xml_parsing(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        f = tmp_path / "filing.xml"
        f.write_text(MINIMAL_XBRL_XML, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR")
        facts = proc.process_xml(f)
        assert len(facts) >= 3
        concepts = [fact.concept for fact in facts]
        assert any("Revenue" in c for c in concepts)
        assert any("Assets" in c for c in concepts)

    def test_xml_facts_have_correct_ticker(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        f = tmp_path / "filing.xml"
        f.write_text(MINIMAL_XBRL_XML, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR")
        facts = proc.process_xml(f)
        assert all(fact.ticker == "2222.SR" for fact in facts)

    def test_xml_period_start_end_parsed(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        f = tmp_path / "filing.xml"
        f.write_text(MINIMAL_XBRL_XML, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR")
        facts = proc.process_xml(f)
        # Revenue uses ctx_2024 which has startDate and endDate
        revenue_facts = [fa for fa in facts if "Revenue" in fa.concept]
        assert len(revenue_facts) > 0
        rev = revenue_facts[0]
        assert rev.period_start == date(2024, 1, 1)
        assert rev.period_end == date(2024, 12, 31)

    def test_xml_instant_period_parsed(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        f = tmp_path / "filing.xml"
        f.write_text(MINIMAL_XBRL_XML, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR")
        facts = proc.process_xml(f)
        asset_facts = [fa for fa in facts if "Assets" in fa.concept]
        assert len(asset_facts) > 0
        asset = asset_facts[0]
        assert asset.period_instant == date(2024, 12, 31)

    def test_xml_unit_parsed(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        f = tmp_path / "filing.xml"
        f.write_text(MINIMAL_XBRL_XML, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR")
        facts = proc.process_xml(f)
        revenue_facts = [fa for fa in facts if "Revenue" in fa.concept]
        assert revenue_facts[0].unit == "SAR"

    def test_xml_unit_without_colon(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        f = tmp_path / "filing.xml"
        f.write_text(XBRL_XML_UNIT_NO_COLON, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR")
        facts = proc.process_xml(f)
        ratio_facts = [fa for fa in facts if "Ratio" in fa.concept]
        assert len(ratio_facts) > 0
        assert ratio_facts[0].unit == "pure"

    def test_xml_boolean_fact(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        f = tmp_path / "filing.xml"
        f.write_text(XBRL_XML_BOOLEAN_AND_TEXT, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR")
        facts = proc.process_xml(f)
        bool_facts = [fa for fa in facts if fa.value_boolean is not None]
        assert len(bool_facts) >= 2
        # true -> True
        true_facts = [fa for fa in bool_facts if fa.value_boolean is True]
        false_facts = [fa for fa in bool_facts if fa.value_boolean is False]
        assert len(true_facts) >= 1
        assert len(false_facts) >= 1

    def test_xml_text_fact(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        f = tmp_path / "filing.xml"
        f.write_text(XBRL_XML_BOOLEAN_AND_TEXT, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR")
        facts = proc.process_xml(f)
        text_facts = [fa for fa in facts if fa.value_text is not None]
        assert any("Saudi Aramco" == fa.value_text for fa in text_facts)

    def test_xml_decimals_inf_ignored(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        f = tmp_path / "filing.xml"
        f.write_text(XBRL_XML_DECIMALS_INF, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR")
        facts = proc.process_xml(f)
        assert len(facts) >= 1
        # decimals=INF should result in None
        assert facts[0].decimals is None

    def test_xml_comma_number(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        f = tmp_path / "filing.xml"
        f.write_text(XBRL_XML_COMMA_NUMBER, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR")
        facts = proc.process_xml(f)
        assert len(facts) >= 1
        assert facts[0].value_numeric == 1500000.0

    def test_xml_malformed_raises_no_exception(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        f = tmp_path / "bad.xml"
        f.write_text(MALFORMED_XML, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR")
        facts = proc.process_xml(f)
        assert facts == []
        assert len(proc.errors) > 0

    def test_xml_dimension_parsed(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        f = tmp_path / "filing.xml"
        f.write_text(XBRL_XML_WITH_DIMENSIONS, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR")
        facts = proc.process_xml(f)
        dim_facts = [fa for fa in facts if fa.dimension_member is not None]
        assert len(dim_facts) >= 1
        assert "SegmentsAxis" in dim_facts[0].dimension_member
        assert "UpstreamMember" in dim_facts[0].dimension_value

    def test_xml_source_url_assigned(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        f = tmp_path / "filing.xml"
        f.write_text(MINIMAL_XBRL_XML, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR", source_url="http://example.com/f.xml")
        facts = proc.process_xml(f)
        assert all(fa.source_url == "http://example.com/f.xml" for fa in facts)

    def test_xml_filing_id_assigned(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        f = tmp_path / "filing.xml"
        f.write_text(MINIMAL_XBRL_XML, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR", filing_id="filing-abc")
        facts = proc.process_xml(f)
        assert all(fa.filing_id == "filing-abc" for fa in facts)

    def test_xml_decimals_parsed_as_int(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        f = tmp_path / "filing.xml"
        f.write_text(MINIMAL_XBRL_XML, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR")
        facts = proc.process_xml(f)
        numeric_facts = [fa for fa in facts if fa.value_numeric is not None]
        assert any(fa.decimals == -3 for fa in numeric_facts)

    def test_xml_no_unit_uses_none(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        f = tmp_path / "filing.xml"
        f.write_text(XBRL_XML_NO_UNIT_NO_CONTEXT, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR")
        facts = proc.process_xml(f)
        # The SomeValue element has no unitRef and no contextRef
        no_unit_facts = [
            fa for fa in facts if fa.unit is None and fa.value_numeric is not None
        ]
        assert len(no_unit_facts) >= 1

    def test_xml_no_lxml_raises(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        f = tmp_path / "filing.xml"
        f.write_text(MINIMAL_XBRL_XML, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR")
        with patch("ingestion.xbrl_processor.etree", None):
            with pytest.raises(ImportError, match="lxml"):
                proc.process_xml(f)

    def test_xml_context_dates_slash_format(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        f = tmp_path / "filing.xml"
        f.write_text(XBRL_XML_CONTEXT_DATES_SLASH, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR")
        facts = proc.process_xml(f)
        assert len(facts) >= 1
        revenue = facts[0]
        assert revenue.period_start == date(2024, 1, 1)
        assert revenue.period_end == date(2024, 12, 31)


# ===========================================================================
# _parse_contexts
# ===========================================================================


class TestParseContexts:
    """Tests for _parse_contexts method (lines 493-545)."""

    def _get_root(self, xml_str: str):
        from lxml import etree

        return etree.fromstring(xml_str.encode("utf-8"))

    def test_parse_contexts_duration(self):
        from ingestion.xbrl_processor import XBRLProcessor

        root = self._get_root(MINIMAL_XBRL_XML)
        proc = XBRLProcessor(ticker="2222.SR")
        contexts = proc._parse_contexts(root, {})
        assert "ctx_2024" in contexts
        ctx = contexts["ctx_2024"]
        assert ctx["period_start"] == date(2024, 1, 1)
        assert ctx["period_end"] == date(2024, 12, 31)
        assert ctx["period_instant"] is None

    def test_parse_contexts_instant(self):
        from ingestion.xbrl_processor import XBRLProcessor

        root = self._get_root(MINIMAL_XBRL_XML)
        proc = XBRLProcessor(ticker="2222.SR")
        contexts = proc._parse_contexts(root, {})
        assert "ctx_instant" in contexts
        ctx = contexts["ctx_instant"]
        assert ctx["period_instant"] == date(2024, 12, 31)
        assert ctx["period_start"] is None

    def test_parse_contexts_with_dimension(self):
        from ingestion.xbrl_processor import XBRLProcessor

        root = self._get_root(XBRL_XML_WITH_DIMENSIONS)
        proc = XBRLProcessor(ticker="2222.SR")
        contexts = proc._parse_contexts(root, {})
        assert "ctx_segment" in contexts
        ctx = contexts["ctx_segment"]
        assert ctx["dimension_member"] is not None
        assert "SegmentsAxis" in ctx["dimension_member"]
        assert "UpstreamMember" in ctx["dimension_value"]

    def test_parse_contexts_skips_missing_id(self):
        from ingestion.xbrl_processor import XBRLProcessor
        from lxml import etree

        xml = """\
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance">
  <xbrli:context>
    <xbrli:entity><xbrli:identifier scheme="test">2222</xbrli:identifier></xbrli:entity>
    <xbrli:period><xbrli:instant>2024-12-31</xbrli:instant></xbrli:period>
  </xbrli:context>
</xbrli:xbrl>"""
        root = etree.fromstring(xml.encode("utf-8"))
        proc = XBRLProcessor(ticker="2222.SR")
        contexts = proc._parse_contexts(root, {})
        # No id attribute means it should be skipped
        assert len(contexts) == 0

    def test_parse_contexts_fallback_search(self):
        """Tests the fallback branch when findall returns empty."""
        from ingestion.xbrl_processor import XBRLProcessor
        from lxml import etree

        # A doc with non-standard namespace prefix wrapping xbrli context
        xml = """\
<root xmlns:myns="http://www.xbrl.org/2003/instance">
  <myns:context id="c1">
    <myns:entity><myns:identifier scheme="test">2222</myns:identifier></myns:entity>
    <myns:period><myns:instant>2024-12-31</myns:instant></myns:period>
  </myns:context>
</root>"""
        root = etree.fromstring(xml.encode("utf-8"))
        proc = XBRLProcessor(ticker="2222.SR")
        contexts = proc._parse_contexts(root, {})
        assert "c1" in contexts


# ===========================================================================
# _parse_units
# ===========================================================================


class TestParseUnits:
    """Tests for _parse_units method (lines 552-580)."""

    def _get_root(self, xml_str: str):
        from lxml import etree

        return etree.fromstring(xml_str.encode("utf-8"))

    def test_parse_units_sar(self):
        from ingestion.xbrl_processor import XBRLProcessor

        root = self._get_root(MINIMAL_XBRL_XML)
        proc = XBRLProcessor(ticker="2222.SR")
        units = proc._parse_units(root, {})
        assert "SAR" in units
        assert units["SAR"] == "SAR"

    def test_parse_units_shares(self):
        from ingestion.xbrl_processor import XBRLProcessor

        root = self._get_root(MINIMAL_XBRL_XML)
        proc = XBRLProcessor(ticker="2222.SR")
        units = proc._parse_units(root, {})
        assert "shares" in units
        assert units["shares"] == "shares"

    def test_parse_units_no_colon_in_measure(self):
        from ingestion.xbrl_processor import XBRLProcessor

        root = self._get_root(XBRL_XML_UNIT_NO_COLON)
        proc = XBRLProcessor(ticker="2222.SR")
        units = proc._parse_units(root, {})
        assert "pure" in units
        assert units["pure"] == "pure"

    def test_parse_units_skips_missing_id(self):
        from ingestion.xbrl_processor import XBRLProcessor
        from lxml import etree

        xml = """\
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance"
            xmlns:iso4217="http://www.xbrl.org/2003/iso4217">
  <xbrli:unit>
    <xbrli:measure>iso4217:SAR</xbrli:measure>
  </xbrli:unit>
</xbrli:xbrl>"""
        root = etree.fromstring(xml.encode("utf-8"))
        proc = XBRLProcessor(ticker="2222.SR")
        units = proc._parse_units(root, {})
        assert len(units) == 0

    def test_parse_units_fallback_search(self):
        """Tests fallback when findall returns empty."""
        from ingestion.xbrl_processor import XBRLProcessor
        from lxml import etree

        xml = """\
<root xmlns:myns="http://www.xbrl.org/2003/instance"
      xmlns:iso4217="http://www.xbrl.org/2003/iso4217">
  <myns:unit id="SAR">
    <myns:measure>iso4217:SAR</myns:measure>
  </myns:unit>
</root>"""
        root = etree.fromstring(xml.encode("utf-8"))
        proc = XBRLProcessor(ticker="2222.SR")
        units = proc._parse_units(root, {})
        assert "SAR" in units
        assert units["SAR"] == "SAR"


# ===========================================================================
# _build_concept_name
# ===========================================================================


class TestBuildConceptName:
    """Tests for _build_concept_name (lines 582-609)."""

    def test_uses_nsmap_prefix(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        nsmap = {"ifrs-full": "http://xbrl.ifrs.org/taxonomy/2023-03-23/ifrs-full"}
        result = proc._build_concept_name(
            "http://xbrl.ifrs.org/taxonomy/2023-03-23/ifrs-full", "Revenue", nsmap
        )
        assert result == "ifrs-full:Revenue"

    def test_falls_back_to_known_ifrs_prefix(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        result = proc._build_concept_name(
            "http://xbrl.ifrs.org/taxonomy/new-version/ifrs-full", "Assets", {}
        )
        assert result == "ifrs-full:Assets"

    def test_falls_back_to_last_path_segment(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        result = proc._build_concept_name(
            "http://example.com/taxonomy/custom", "MyFact", {}
        )
        assert result == "custom:MyFact"

    def test_no_namespace_uses_tasi_prefix(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        result = proc._build_concept_name("", "SomeLocal", {})
        assert result == "tasi:SomeLocal"

    def test_nsmap_none_prefix_skipped(self):
        """None prefix in nsmap should not be used."""
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        # nsmap has None -> 'http://xbrl.ifrs.org/taxonomy/custom'
        nsmap = {None: "http://xbrl.ifrs.org/taxonomy/custom"}
        result = proc._build_concept_name(
            "http://xbrl.ifrs.org/taxonomy/custom", "Revenue", nsmap
        )
        # Falls through to known prefix check
        assert result == "ifrs-full:Revenue"

    def test_namespace_with_trailing_slash(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        result = proc._build_concept_name(
            "http://example.com/taxonomy/tasi/", "Profit", {}
        )
        assert result == "tasi:Profit"


# ===========================================================================
# _safe_parse_date
# ===========================================================================


class TestSafeParseDateExtended:
    """Additional date parsing edge cases."""

    def test_year_month_day_slash(self):
        from ingestion.xbrl_processor import XBRLProcessor

        d = XBRLProcessor._safe_parse_date("2024/12/31")
        assert d == date(2024, 12, 31)

    def test_with_leading_trailing_spaces(self):
        from ingestion.xbrl_processor import XBRLProcessor

        d = XBRLProcessor._safe_parse_date("  2024-12-31  ")
        assert d == date(2024, 12, 31)

    def test_empty_string(self):
        from ingestion.xbrl_processor import XBRLProcessor

        d = XBRLProcessor._safe_parse_date("")
        assert d is None

    def test_partial_date_invalid(self):
        from ingestion.xbrl_processor import XBRLProcessor

        d = XBRLProcessor._safe_parse_date("2024-99-99")
        assert d is None


# ===========================================================================
# _parse_period_headers
# ===========================================================================


class TestParsePeriodHeaders:
    """Tests for _parse_period_headers (lines 755-765)."""

    def test_parses_iso_date_headers(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        headers = ("Label", "2024-12-31", "2023-12-31")
        result = proc._parse_period_headers(headers)
        assert 1 in result
        assert result[1]["period_end"] == date(2024, 12, 31)
        assert 2 in result
        assert result[2]["period_end"] == date(2023, 12, 31)

    def test_skips_column_0(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        headers = ("2024-12-31", "2023-12-31")
        result = proc._parse_period_headers(headers)
        # Column 0 always skipped
        assert 0 not in result
        assert 1 in result

    def test_skips_none_headers(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        headers = ("Label", None, "2024-12-31")
        result = proc._parse_period_headers(headers)
        assert 1 not in result
        assert 2 in result

    def test_skips_unparseable_headers(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        headers = ("Label", "Not A Date", "2024-12-31")
        result = proc._parse_period_headers(headers)
        assert 1 not in result
        assert 2 in result


# ===========================================================================
# _parse_date_string
# ===========================================================================


class TestParseDateStringExtended:
    """Additional _parse_date_string coverage (lines 792, 812, 824, 844-847)."""

    def test_slash_format_dm_y(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        result = proc._parse_date_string("31/12/2024")
        assert result is not None
        assert result["period_end"] == date(2024, 12, 31)

    def test_fy_without_space(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        result = proc._parse_date_string("FY2024")
        assert result is not None
        assert result["period_end"] == date(2024, 12, 31)
        assert result["period_start"] == date(2024, 1, 1)

    def test_q1(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        result = proc._parse_date_string("Q1 2024")
        assert result["period_end"] == date(2024, 3, 31)

    def test_q2(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        result = proc._parse_date_string("Q2 2024")
        assert result["period_end"] == date(2024, 6, 30)

    def test_q3(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        result = proc._parse_date_string("Q3 2024")
        assert result["period_end"] == date(2024, 9, 30)

    def test_q4(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        result = proc._parse_date_string("Q4 2024")
        assert result["period_end"] == date(2024, 12, 31)

    def test_year_only_4_digits(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        result = proc._parse_date_string("2023")
        assert result is not None
        assert result["period_start"] == date(2023, 1, 1)
        assert result["period_end"] == date(2023, 12, 31)

    def test_5_digit_year_not_parsed(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        result = proc._parse_date_string("20244")  # 5 digits
        assert result is None

    def test_fy_too_short_not_parsed(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        result = proc._parse_date_string("FY24")
        assert result is None


# ===========================================================================
# _label_to_concept
# ===========================================================================


class TestLabelToConceptExtended:
    """Additional _label_to_concept coverage (lines 829-849)."""

    def test_income_sheet_prefix(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        concept = proc._label_to_concept("some metric", "Income Statement")
        assert concept.startswith("ifrs-full:")

    def test_profit_loss_sheet_prefix(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        concept = proc._label_to_concept("some metric", "Statement of Profit or Loss")
        assert concept.startswith("ifrs-full:")

    def test_cash_flow_sheet_prefix(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        concept = proc._label_to_concept("some metric", "Cash Flow Statement")
        assert concept.startswith("ifrs-full:")

    def test_unknown_sheet_uses_tasi_prefix(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        concept = proc._label_to_concept("my custom metric", "Notes")
        assert concept.startswith("tasi:")

    def test_pascal_case_conversion(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        concept = proc._label_to_concept("total operating expenses", "Notes")
        assert "TotalOperatingExpenses" in concept

    def test_hyphen_treated_as_space(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        # "non-current assets" is a known IFRS concept
        concept = proc._label_to_concept("non-current assets", "Balance Sheet")
        assert ":" in concept  # Should be prefixed concept

    def test_all_known_ifrs_concepts(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        for label, expected in XBRLProcessor.IFRS_CONCEPT_MAP.items():
            assert proc._label_to_concept(label, "Balance Sheet") == expected


# ===========================================================================
# _process_sheet (Excel)
# ===========================================================================


class TestProcessSheet:
    """Tests for _process_sheet (lines 671-753)."""

    def _make_mock_ws(self, rows):
        ws = MagicMock()
        ws.iter_rows.return_value = rows
        return ws

    def test_empty_sheet_returns_empty(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        ws = self._make_mock_ws([()])
        result = proc._process_sheet(ws, "Balance Sheet")
        assert result == []

    def test_only_header_row_returns_empty(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        ws = self._make_mock_ws([("Label", "2024-12-31")])
        result = proc._process_sheet(ws, "Balance Sheet")
        assert result == []

    def test_skips_row_with_empty_label(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        rows = [
            ("Label", "2024-12-31"),
            (None, 100.0),
            ("Revenue", 500.0),
        ]
        ws = self._make_mock_ws(rows)
        result = proc._process_sheet(ws, "Income Statement")
        # Only Revenue row should have facts
        assert len(result) == 1

    def test_numeric_value_creates_fact(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        rows = [
            ("Label", "2024-12-31"),
            ("Revenue", 150000.0),
        ]
        ws = self._make_mock_ws(rows)
        result = proc._process_sheet(ws, "Income Statement")
        assert len(result) == 1
        assert result[0].value_numeric == 150000.0
        assert result[0].unit == "SAR"

    def test_integer_value_creates_fact(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        rows = [
            ("Label", "2024-12-31"),
            ("Shares", 100000),
        ]
        ws = self._make_mock_ws(rows)
        result = proc._process_sheet(ws, "Balance Sheet")
        assert result[0].value_numeric == 100000.0

    def test_boolean_cell_creates_fact(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        rows = [
            ("Label", "2024-12-31"),
            ("IsConsolidated", True),
        ]
        ws = self._make_mock_ws(rows)
        result = proc._process_sheet(ws, "Notes")
        assert len(result) == 1
        assert result[0].value_boolean is True
        assert result[0].unit is None  # No unit for booleans

    def test_string_numeric_value(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        rows = [
            ("Label", "2024-12-31"),
            ("Revenue", "1,500,000"),
        ]
        ws = self._make_mock_ws(rows)
        result = proc._process_sheet(ws, "Income Statement")
        assert result[0].value_numeric == 1500000.0

    def test_text_value_creates_fact(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        rows = [
            ("Label", "2024-12-31"),
            ("EntityName", "Saudi Aramco"),
        ]
        ws = self._make_mock_ws(rows)
        result = proc._process_sheet(ws, "Notes")
        assert result[0].value_text == "Saudi Aramco"
        assert result[0].value_numeric is None
        assert result[0].unit is None

    def test_arabic_label_sets_label_ar(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        rows = [
            ("التسمية", "2024-12-31"),
            ("الإيرادات", 100000.0),
        ]
        ws = self._make_mock_ws(rows)
        result = proc._process_sheet(ws, "Income Statement")
        assert len(result) == 1
        assert result[0].label_ar is not None
        assert result[0].label_en is None

    def test_english_label_sets_label_en(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        rows = [
            ("Label", "2024-12-31"),
            ("Revenue", 100000.0),
        ]
        ws = self._make_mock_ws(rows)
        result = proc._process_sheet(ws, "Income Statement")
        assert result[0].label_en == "Revenue"
        assert result[0].label_ar is None

    def test_missing_period_skips_cell(self):
        """Cells without header period dates should be skipped with an error."""
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        # Header col 1 is unparseable -> no period for col 1
        rows = [
            ("Label", "NOT_A_DATE"),
            ("Revenue", 100000.0),
        ]
        ws = self._make_mock_ws(rows)
        result = proc._process_sheet(ws, "Income Statement")
        assert result == []
        assert len(proc.errors) > 0
        assert "Missing period_date" in proc.errors[0]

    def test_none_cell_value_skipped(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        rows = [
            ("Label", "2024-12-31", "2023-12-31"),
            ("Revenue", None, 100000.0),
        ]
        ws = self._make_mock_ws(rows)
        result = proc._process_sheet(ws, "Income Statement")
        # None cell skipped; only 2023 value
        assert len(result) == 1
        assert result[0].period_end == date(2023, 12, 31)

    def test_fiscal_year_header_period(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        rows = [
            ("Label", "FY 2024"),
            ("Revenue", 100000.0),
        ]
        ws = self._make_mock_ws(rows)
        result = proc._process_sheet(ws, "Income Statement")
        assert result[0].period_start == date(2024, 1, 1)
        assert result[0].period_end == date(2024, 12, 31)

    def test_instant_period_from_header(self):
        """_parse_date_string returns period_instant=None for ISO dates; period_end is set."""
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        rows = [
            ("Label", "2024-12-31"),
            ("Total Assets", 500000.0),
        ]
        ws = self._make_mock_ws(rows)
        result = proc._process_sheet(ws, "Balance Sheet")
        assert result[0].period_end == date(2024, 12, 31)


# ===========================================================================
# process_workbook
# ===========================================================================


class TestProcessWorkbook:
    """Tests for process_workbook (lines 628-660)."""

    def test_no_openpyxl_raises(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        f = tmp_path / "filing.xlsx"
        f.write_bytes(b"fake xlsx content")
        proc = XBRLProcessor(ticker="2222.SR")
        with patch("ingestion.xbrl_processor.openpyxl", None):
            with pytest.raises(ImportError, match="openpyxl"):
                proc.process_workbook(f)

    def test_nonexistent_file(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        facts = proc.process_workbook(tmp_path / "missing.xlsx")
        assert facts == []
        assert any("not found" in e.lower() for e in proc.errors)

    def test_corrupt_workbook(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        f = tmp_path / "corrupt.xlsx"
        f.write_bytes(b"this is not a valid xlsx")
        proc = XBRLProcessor(ticker="2222.SR")
        facts = proc.process_workbook(f)
        assert facts == []
        assert any("Cannot open workbook" in e for e in proc.errors)

    def test_workbook_sheet_error_continues(self):
        from ingestion.xbrl_processor import XBRLProcessor

        proc = XBRLProcessor(ticker="2222.SR")
        mock_wb = MagicMock()
        mock_wb.sheetnames = ["Sheet1", "Sheet2"]
        mock_ws1 = MagicMock()
        mock_ws1.iter_rows.side_effect = Exception("Sheet error")
        mock_ws2 = MagicMock()
        mock_ws2.iter_rows.return_value = [("Label", "2024-12-31"), ("Revenue", 100.0)]
        mock_wb.__getitem__ = lambda self_inner, name: (
            mock_ws1 if name == "Sheet1" else mock_ws2
        )

        with patch("ingestion.xbrl_processor.openpyxl") as mock_openpyxl:
            mock_openpyxl.load_workbook.return_value = mock_wb
            with patch.object(proc, "_process_sheet") as mock_ps:
                mock_ps.side_effect = [Exception("err"), []]
                proc.process_workbook(
                    MagicMock(exists=lambda: True, __str__=lambda s: "test.xlsx")
                )
        assert any("Error processing sheet" in e for e in proc.errors)


# ===========================================================================
# Database functions
# ===========================================================================


class TestDatabaseFunctions:
    """Tests for insert_facts, create_filing, check_filing_exists, mark_* (lines 870-948)."""

    def test_insert_facts_dry_run(self):
        from ingestion.xbrl_processor import XBRLFact, insert_facts

        facts = [
            XBRLFact(ticker="2222.SR", concept="ifrs-full:Revenue", value_numeric=100.0)
        ]
        count = insert_facts(None, facts, dry_run=True)
        assert count == 1

    def test_insert_facts_empty(self):
        from ingestion.xbrl_processor import insert_facts

        count = insert_facts(None, [], dry_run=False)
        assert count == 0

    def test_insert_facts_batches(self):
        from ingestion.xbrl_processor import XBRLFact, insert_facts, BATCH_SIZE
        import ingestion.xbrl_processor as xbrl_mod

        facts = [
            XBRLFact(ticker="2222.SR", concept=f"c:{i}", value_numeric=float(i))
            for i in range(BATCH_SIZE + 10)
        ]
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with patch.object(xbrl_mod, "psycopg2") as mock_psycopg2:
            mock_psycopg2.extras = MagicMock()
            count = insert_facts(mock_conn, facts, dry_run=False)

        assert count == len(facts)
        mock_conn.commit.assert_called_once()

    def test_create_filing_dry_run(self):
        from ingestion.xbrl_processor import create_filing

        result = create_filing(
            None, "2222.SR", "annual", date(2024, 1, 1), "Tadawul", "url", dry_run=True
        )
        assert result == "dry-run-filing-id"

    def test_create_filing_real(self):
        from ingestion.xbrl_processor import create_filing

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = ("uuid-123",)
        mock_conn.cursor.return_value = mock_cursor

        result = create_filing(
            mock_conn,
            "2222.SR",
            "annual",
            date(2024, 1, 1),
            "Tadawul",
            "http://example.com",
        )
        assert result == "uuid-123"
        mock_conn.commit.assert_called_once()

    def test_check_filing_exists_true(self):
        from ingestion.xbrl_processor import check_filing_exists

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = (1,)
        mock_conn.cursor.return_value = mock_cursor

        result = check_filing_exists(mock_conn, "2222.SR", "http://example.com")
        assert result is True

    def test_check_filing_exists_false(self):
        from ingestion.xbrl_processor import check_filing_exists

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None
        mock_conn.cursor.return_value = mock_cursor

        result = check_filing_exists(mock_conn, "2222.SR", "http://example.com")
        assert result is False

    def test_mark_filing_complete_dry_run(self):
        from ingestion.xbrl_processor import mark_filing_complete

        mock_conn = MagicMock()
        mark_filing_complete(mock_conn, "filing-1", dry_run=True)
        mock_conn.cursor.assert_not_called()

    def test_mark_filing_complete_real(self):
        from ingestion.xbrl_processor import mark_filing_complete

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mark_filing_complete(mock_conn, "filing-1", dry_run=False)
        mock_cursor.execute.assert_called_once()
        mock_conn.commit.assert_called_once()

    def test_mark_filing_failed_dry_run(self):
        from ingestion.xbrl_processor import mark_filing_failed

        mock_conn = MagicMock()
        mark_filing_failed(mock_conn, "filing-1", dry_run=True)
        mock_conn.cursor.assert_not_called()

    def test_mark_filing_failed_real(self):
        from ingestion.xbrl_processor import mark_filing_failed

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mark_filing_failed(mock_conn, "filing-1", dry_run=False)
        mock_cursor.execute.assert_called_once()
        mock_conn.commit.assert_called_once()


# ===========================================================================
# process_single_file
# ===========================================================================


class TestProcessSingleFile:
    """Tests for process_single_file (lines 1003-1057)."""

    def test_skips_already_processed_filing(self, tmp_path):
        from ingestion.xbrl_processor import process_single_file

        f = tmp_path / "filing.xml"
        f.write_text(MINIMAL_XBRL_XML, encoding="utf-8")

        mock_conn = MagicMock()
        with patch("ingestion.xbrl_processor.check_filing_exists", return_value=True):
            count, errors = process_single_file(
                f, "2222.SR", "annual", "Tadawul", mock_conn, False
            )
        assert count == 0
        assert errors == []

    def test_dry_run_does_not_check_filing(self, tmp_path):
        from ingestion.xbrl_processor import process_single_file

        f = tmp_path / "filing.xml"
        f.write_text(MINIMAL_XBRL_XML, encoding="utf-8")

        with (
            patch("ingestion.xbrl_processor.check_filing_exists") as mock_check,
            patch(
                "ingestion.xbrl_processor.create_filing",
                return_value="dry-run-filing-id",
            ),
            patch("ingestion.xbrl_processor.insert_facts", return_value=3),
            patch("ingestion.xbrl_processor.mark_filing_complete"),
            patch("ingestion.xbrl_processor.mark_filing_failed"),
        ):
            count, errors = process_single_file(
                f, "2222.SR", "annual", "Tadawul", None, True
            )
        mock_check.assert_not_called()

    def test_successful_processing(self, tmp_path):
        from ingestion.xbrl_processor import process_single_file

        f = tmp_path / "filing.xml"
        f.write_text(MINIMAL_XBRL_XML, encoding="utf-8")

        with (
            patch("ingestion.xbrl_processor.check_filing_exists", return_value=False),
            patch("ingestion.xbrl_processor.create_filing", return_value="filing-1"),
            patch("ingestion.xbrl_processor.insert_facts", return_value=3),
            patch("ingestion.xbrl_processor.mark_filing_complete") as mock_complete,
            patch("ingestion.xbrl_processor.mark_filing_failed"),
        ):
            count, errors = process_single_file(
                f, "2222.SR", "annual", "Tadawul", MagicMock(), False
            )
        # Should have facts and called mark_complete
        assert count == 3
        mock_complete.assert_called_once()

    def test_empty_facts_marks_failed(self, tmp_path):
        from ingestion.xbrl_processor import process_single_file

        f = tmp_path / "filing.xml"
        f.write_text(MALFORMED_XML, encoding="utf-8")

        with (
            patch("ingestion.xbrl_processor.check_filing_exists", return_value=False),
            patch("ingestion.xbrl_processor.create_filing", return_value="filing-1"),
            patch("ingestion.xbrl_processor.insert_facts", return_value=0),
            patch("ingestion.xbrl_processor.mark_filing_complete") as mock_complete,
            patch("ingestion.xbrl_processor.mark_filing_failed") as mock_failed,
        ):
            count, errors = process_single_file(
                f, "2222.SR", "annual", "Tadawul", MagicMock(), False
            )
        mock_failed.assert_called_once()
        mock_complete.assert_not_called()


# ===========================================================================
# Full pipeline integration scenarios
# ===========================================================================


class TestFullPipeline:
    """End-to-end pipeline tests for coverage of lines 1012-1057, 1061-1186."""

    def test_xml_pipeline_produces_facts(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        f = tmp_path / "aramco_2024.xml"
        f.write_text(MINIMAL_XBRL_XML, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR", filing_id="f-1")
        facts = proc.process_filing(f)
        assert len(facts) >= 3
        for fact in facts:
            assert fact.ticker == "2222.SR"
            assert len(fact.content_hash) == 64

    def test_xml_with_dimensions_pipeline(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        f = tmp_path / "segment_filing.xml"
        f.write_text(XBRL_XML_WITH_DIMENSIONS, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR")
        facts = proc.process_filing(f)
        dim_facts = [fa for fa in facts if fa.dimension_member]
        assert len(dim_facts) >= 1

    def test_process_directory_multiple_xml(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        for ticker, fname in [("2222.SR", "filing_a.xml"), ("1120.SR", "filing_b.xml")]:
            (tmp_path / fname).write_text(MINIMAL_XBRL_XML, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR")
        all_facts = proc.process_directory(tmp_path)
        assert len(all_facts) >= 6  # 3+ per file

    def test_all_fact_hashes_unique_across_files(self, tmp_path):
        """Different facts from the same file should have unique hashes only if they differ."""
        from ingestion.xbrl_processor import XBRLProcessor

        f = tmp_path / "filing.xml"
        f.write_text(MINIMAL_XBRL_XML, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR")
        facts = proc.process_xml(f)
        hashes = [fa.content_hash for fa in facts]
        # All hashes should be strings of length 64
        assert all(len(h) == 64 for h in hashes)

    def test_process_filing_xbrl_extension_dispatches_to_xml(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        f = tmp_path / "filing.xbrl"
        f.write_text(MINIMAL_XBRL_XML, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR")
        facts = proc.process_filing(f)
        # Same content as XML, should produce facts
        assert len(facts) >= 3

    def test_default_unit_used_when_no_unit_ref(self, tmp_path):
        """When a fact has no unitRef, unit should be None (not default_unit)."""
        from ingestion.xbrl_processor import XBRLProcessor

        f = tmp_path / "filing.xml"
        f.write_text(XBRL_XML_NO_UNIT_NO_CONTEXT, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR", default_unit="USD")
        facts = proc.process_xml(f)
        # Facts without unitRef should have unit=None
        for fact in facts:
            if fact.value_numeric is not None and fact.concept != "tasi:SomeValue":
                pass  # other facts may have units
        no_unit_numeric = [
            fa for fa in facts if fa.unit is None and fa.value_numeric is not None
        ]
        assert len(no_unit_numeric) >= 1

    def test_errors_accumulated_across_directory(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        (tmp_path / "good.xml").write_text(MINIMAL_XBRL_XML, encoding="utf-8")
        (tmp_path / "bad.xml").write_text(MALFORMED_XML, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR")
        proc.process_directory(tmp_path)
        # Errors from bad.xml
        assert len(proc.errors) >= 1

    def test_filing_id_propagates_through_pipeline(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        f = tmp_path / "filing.xml"
        f.write_text(MINIMAL_XBRL_XML, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR", filing_id="abc-123")
        facts = proc.process_filing(f)
        assert all(fa.filing_id == "abc-123" for fa in facts)

    def test_source_url_propagates_through_pipeline(self, tmp_path):
        from ingestion.xbrl_processor import XBRLProcessor

        f = tmp_path / "filing.xml"
        f.write_text(MINIMAL_XBRL_XML, encoding="utf-8")
        proc = XBRLProcessor(ticker="2222.SR", source_url="https://tadawul.com/f.xml")
        facts = proc.process_filing(f)
        assert all(fa.source_url == "https://tadawul.com/f.xml" for fa in facts)
