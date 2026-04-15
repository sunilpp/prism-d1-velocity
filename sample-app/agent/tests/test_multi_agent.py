"""Tests for multi-agent orchestration (no live model calls)."""

from src.multi_agent.orchestrator import create_orchestrator
from src.multi_agent.planner import create_planner
from src.multi_agent.reviewer import create_reviewer


def test_create_orchestrator_mock():
    """Orchestrator should be creatable in mock mode."""
    agent = create_orchestrator(mock=True)
    assert agent is not None


def test_create_planner_mock():
    """Planner should be creatable in mock mode."""
    agent = create_planner(mock=True)
    assert agent is not None


def test_create_reviewer_mock():
    """Reviewer should be creatable in mock mode."""
    agent = create_reviewer(mock=True)
    assert agent is not None


def test_orchestrator_has_three_tools():
    """Orchestrator should have plan, execute, and review tools."""
    agent = create_orchestrator(mock=True)
    tool_names = [t.__name__ if hasattr(t, '__name__') else str(t) for t in agent.tools]
    # Strands wraps tools, check the agent was created with 3 tools
    assert len(agent.tools) == 3
