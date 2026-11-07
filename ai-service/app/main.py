"""AI service API (Phase 8): knowledge status and cited search. No LLM yet; that arrives in Phase 9.

This service is meant to be called by our backend, not by browsers directly. Retrieved text is untrusted
DATA (it may contain instructions); later phases must never treat it as instructions.
"""
from __future__ import annotations

from dataclasses import asdict

from fastapi import Depends, FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from app import config
from app.assistant.answer import answer_question
from app.assistant.chat import chat_question
from app.assistant.factory import make_llm
from app.assistant.llm import LlmError
from app.rag.retriever import InvalidQuery
from app.rag.stores import StoreUnavailable
from app.security import AccessDenied, AccessNotConfigured, check_internal_key
from app.service import KnowledgeService, NotIndexed

app = FastAPI(title="SOC AI Service", version="0.2.0")
app.add_middleware(CORSMiddleware, allow_origins=[config.ALLOWED_ORIGIN], allow_methods=["GET", "POST"], allow_headers=["*"])

_service: KnowledgeService | None = None


def get_service() -> KnowledgeService:
    global _service
    if _service is None:
        _service = KnowledgeService.from_config()  # may raise StoreUnavailable
    return _service


_llm = None
_llm_loaded = False


def get_llm():
    """The language-model client, or None when no key is configured. Looked up once."""
    global _llm, _llm_loaded
    if not _llm_loaded:
        _llm = make_llm()
        _llm_loaded = True
    return _llm


def require_internal_key(x_internal_key: str | None = Header(default=None)) -> None:
    """Dependency for endpoints that cost money. The backend sends the shared secret in x-internal-key."""
    check_internal_key(x_internal_key, config.INTERNAL_API_KEY)


def _error(status: int, message: str, details=None) -> JSONResponse:
    body = {"success": False, "error": {"message": message}}
    if details:
        body["error"]["details"] = details
    return JSONResponse(status_code=status, content=body)


@app.exception_handler(AccessDenied)
async def _access_denied(request: Request, exc: AccessDenied):
    return _error(403, "Not allowed")


@app.exception_handler(AccessNotConfigured)
async def _access_not_configured(request: Request, exc: AccessNotConfigured):
    return _error(503, str(exc))


@app.exception_handler(StoreUnavailable)
async def _store_unavailable(request: Request, exc: StoreUnavailable):
    return _error(503, f"Knowledge search is unavailable: {exc}")


@app.exception_handler(NotIndexed)
async def _not_indexed(request: Request, exc: NotIndexed):
    return _error(503, str(exc))


_LLM_STATUS = {"rate_limited": 429, "blocked": 422, "unavailable": 502, "bad_response": 502,
               "auth": 503, "model_not_found": 503, "not_configured": 503}


@app.exception_handler(LlmError)
async def _llm_error(request: Request, exc: LlmError):
    return _error(_LLM_STATUS.get(exc.kind, 502), str(exc))


@app.exception_handler(InvalidQuery)
async def _invalid_query(request: Request, exc: InvalidQuery):
    return _error(400, str(exc))


@app.exception_handler(RequestValidationError)
async def _validation(request: Request, exc: RequestValidationError):
    return _error(400, "Validation failed", [{"field": ".".join(str(p) for p in e["loc"][1:]), "message": e["msg"]} for e in exc.errors()])


class SearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str = Field(..., max_length=2000)  # the exact limit is enforced (with a clear message) by the retriever
    top_k: int = Field(4, ge=1, le=config.MAX_TOP_K)


@app.get("/health")
def health():
    return {"success": True, "data": {"status": "ok", "service": "ai-service"}}


@app.get("/knowledge/status")
def knowledge_status():
    return {"success": True, "data": get_service().status()}


@app.post("/search")
def search(body: SearchRequest):
    citations = get_service().search(body.query, body.top_k)
    return {
        "success": True,
        "data": {
            "query": " ".join(body.query.split()),
            "count": len(citations),
            # An empty list is a real answer: "nothing in the knowledge base matches". Callers must say so.
            "results": [c.__dict__ for c in citations],
        },
    }


class AskRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: str = Field(..., max_length=2000)
    # [{"label": "Alert", "fields": {"column": value}}]. The backend builds this from data the user may see.
    case_data: list[dict] | None = Field(None, max_length=config.MAX_CASE_SECTIONS)
    hint: str | None = Field(None, max_length=100)  # a search word such as the predicted attack category
    top_k: int = Field(4, ge=1, le=6)


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: str = Field(..., max_length=2000)  # the exact limit is enforced (with a clear message) by chat_question


@app.get("/assistant/status", dependencies=[Depends(require_internal_key)])
def assistant_status():
    llm = get_llm()
    return {"success": True, "data": {"llm_configured": llm is not None, "provider": config.LLM_PROVIDER if llm else None,
                                      "model": llm.model if llm else None}}


@app.post("/assistant/ask", dependencies=[Depends(require_internal_key)])
def assistant_ask(body: AskRequest):
    result = answer_question(body.question, body.case_data, body.hint, get_service(), get_llm(), body.top_k, config.MAX_QUERY_CHARS)
    return {"success": True, "data": asdict(result)}


@app.post("/assistant/chat", dependencies=[Depends(require_internal_key)])
def assistant_chat(body: ChatRequest):
    """General chat: no reference documents, no sources. The answer is unverified model output."""
    result = chat_question(body.question, get_llm(), config.MAX_CHAT_CHARS)
    return {"success": True, "data": asdict(result)}
