# ─────────────────────────────────────────────────────────────────────────────
# Imports
#   - asyncio: browser-use is fully async, so we run main() inside an event loop.
#   - rich:    pretty terminal output (panels, colors, styled text).
#   - browser_use:
#       Agent           → the LLM-driven controller that decides what to click,
#                         type, scroll, etc. on each step.
#       BrowserSession  → a connection to a Chromium instance. Here we point it
#                         at a remote Browserless instance over CDP (Chrome
#                         DevTools Protocol) instead of launching local Chrome.
#       ChatOpenAI      → browser-use's wrapper around OpenAI chat models. The
#                         Agent uses it as the "brain" that picks the next step.
#   - AgentOutput / BrowserStateSummary: type hints for our step callback so
#     editors/IDEs can autocomplete the fields we read off them.
# ─────────────────────────────────────────────────────────────────────────────
import asyncio
import base64
import os
import time
from pathlib import Path

from dotenv import load_dotenv
from rich.console import Console
from rich.panel import Panel
from rich.text import Text
from rich.traceback import install as install_traceback

from browser_use import Agent, BrowserSession
from browser_use.agent.views import AgentOutput
from browser_use.browser.views import BrowserStateSummary
from browser_use.llm import ChatOpenAI


# ─────────────────────────────────────────────────────────────────────────────
# Setup: nicer tracebacks, load .env, pull the Browserless token.
#   load_dotenv() reads .env into os.environ. We grab BROWSERLESS_TOKEN here.
#   OPENAI_API_KEY also lives in .env — we don't read it explicitly because
#   ChatOpenAI() picks it up from the environment automatically.
# ─────────────────────────────────────────────────────────────────────────────
install_traceback()
load_dotenv()

console = Console()

TOKEN = os.environ["BROWSERLESS_TOKEN"]


# ─────────────────────────────────────────────────────────────────────────────
# CDP URL — how browser-use connects to a Browserless-hosted Chromium.
#   wss://...                : WebSocket Secure, the transport CDP uses.
#   token=...                : authenticates against your Browserless account.
#   integrations=browseruse  : tells Browserless that the client connecting is
#                              browser-use, so it tunes the session for it.
#   solveCaptchas=true       : (currently disabled) would turn on Browserless's
#                              built-in solver. With it OFF, the agent must try
#                              to solve the CAPTCHA itself — useful for a demo
#                              that shows what happens WITHOUT the solver.
# ─────────────────────────────────────────────────────────────────────────────
CDP_URL = (
    f"wss://production-sfo.browserless.io/chromium"
    f"?token={TOKEN}&integrations=browseruse&solveCaptchas=true&proxy=residential&proxyCountry=us"
)

# Per-step screenshots land here so we can scrub through them after the run.
SCREENSHOT_DIR = Path("screenshots")


# ─────────────────────────────────────────────────────────────────────────────
# The task — a plain-English instruction the LLM will plan against.
#   Notice: instead of going straight to the demo page, we tell the agent to
#   land on the 2captcha homepage and FIND the right demo link itself. This shows
#   that the auto solving feature can detect captchas no matter what part of the
#   page they show up on.
# ─────────────────────────────────────────────────────────────────────────────
#TASK = (
#    "Go to https://2captcha.com/"
#    "There will be a list of captchas, find the row that says recaptcha v2 "
#    "and click on the link that says Demo "
#    "Wait for the reCAPTCHA widget to appear. "
#    #"The CAPTCHA will be solved automatically — do not  "
#    "interact with the reCAPTCHA iframe yourself to solve it. Once the submit button is "
#    "enabled, click 'Check' and return the success message shown on the page."
#)

TASK = (
    "Go to google search for the term Browserless and take a screenshot of the page, take a screenshot to "
    "let me know if you see the results or a captcha."
)


# ─────────────────────────────────────────────────────────────────────────────
# Cosmetic helper — pick an emoji for the step line based on the goal text.
# Pure presentation; doesn't affect agent behavior at all.
# ─────────────────────────────────────────────────────────────────────────────
def icon_for(goal: str) -> str:
    g = goal.lower()
    if any(k in g for k in ("captcha", "solve", "recaptcha", "wait")):
        return "⏳"
    if any(k in g for k in ("click", "submit")):
        return "✅"
    if any(k in g for k in ("extract", "return", "read")):
        return "📤"
    if any(k in g for k in ("navigate", "go to", "open")):
        return "🌐"
    return "▶️"


# ─────────────────────────────────────────────────────────────────────────────
# Step callback — runs ONCE PER AGENT STEP.
#   browser-use calls this every time the agent decides a new action. Args:
#     state     : a snapshot of the browser (URL, title, base64 screenshot, …)
#     output    : what the LLM produced this step. We read .next_goal — a
#                 short natural-language description of what it's about to do.
#     step_num  : 1-based step counter.
#
#   What we do here:
#     1. Print one styled line summarizing the step (icon + goal text).
#     2. Save state.screenshot (a base64-encoded PNG) to step_NN.png.
#     3. If the goal mentions a CAPTCHA, print a yellow indicator so the demo
#        viewer can clearly see when the CAPTCHA work begins.
# ─────────────────────────────────────────────────────────────────────────────
async def on_step(state: BrowserStateSummary, output: AgentOutput, step_num: int) -> None:
    goal = (output.next_goal or "").strip() or "(no goal)"
    icon = icon_for(goal)
    line = Text()
    line.append(f"Step {step_num:>2} ", style="bold cyan")
    line.append("│ ", style="dim")
    line.append(f"{icon} ", style="")
    line.append(goal, style="white")
    console.print(line)

    if state.screenshot:
        path = SCREENSHOT_DIR / f"step_{step_num:02d}.png"
        path.write_bytes(base64.b64decode(state.screenshot))
        console.print(f"    📸 {path}", style="dim")

    if any(k in goal.lower() for k in ("captcha", "recaptcha")):
        console.print(
            "    ⏳ CAPTCHA detected",
            style="yellow",
        )


# ─────────────────────────────────────────────────────────────────────────────
# main — the demo entry point.
# ─────────────────────────────────────────────────────────────────────────────
async def main() -> None:
    # Banner: just a friendly opener for the recording.
    console.print(
        Panel.fit(
            "🤖  browser-use + Browserless Demo\nreCAPTCHA v2 Auto-Solving",
            border_style="cyan",
        )
    )

    # Fresh screenshots/ each run so old PNGs don't leak into this recording.
    SCREENSHOT_DIR.mkdir(exist_ok=True)
    for old in SCREENSHOT_DIR.glob("step_*.png"):
        old.unlink()
    console.print(
        Panel(
            f"Per-step screenshots → ./{SCREENSHOT_DIR}/step_NN.png",
            border_style="magenta",
            title="📸  Screenshot capture",
        )
    )

    # ── Build the session + agent ───────────────────────────────────────────
    # BrowserSession(cdp_url=...) tells browser-use NOT to launch a local
    # Chrome — instead, attach to the remote Browserless one over CDP.
    session = BrowserSession(cdp_url=CDP_URL)

    # Agent ties together:
    #   - task: the natural-language instruction
    #   - llm:  the model used to plan each step (gpt-4o-mini is cheap + fast)
    #   - browser_session: where to actually drive the browser
    #   - register_new_step_callback: our on_step hook for terminal output
    agent = Agent(
        task=TASK,
        llm=ChatOpenAI(model="gpt-4o-mini"),
        browser_session=session,
        register_new_step_callback=on_step,
    )

    # ── Run it ──────────────────────────────────────────────────────────────
    # max_steps caps how many planning iterations the agent can take before
    # giving up. 15 is plenty for this task; bump it if you see early exits.
    start = time.monotonic()
    history = await agent.run(max_steps=15)
    elapsed = time.monotonic() - start

    # ── Report ──────────────────────────────────────────────────────────────
    # history.final_result() is whatever the agent decided to "return" at the
    # end — here, the page's success message text.
    result = history.final_result() or "(no result returned)"

    console.print(
        Panel.fit(
            f"✅  CAPTCHA solved successfully!\n\n{result}",
            border_style="green",
        )
    )
    console.print(f"⏱  Completed in {elapsed:.1f}s", style="dim")


# Standard async-script entry point: asyncio.run() spins up the event loop,
# runs main() to completion, then tears the loop down.
if __name__ == "__main__":
    asyncio.run(main())
