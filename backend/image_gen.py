import os
import uuid
from emergentintegrations.llm.chat import LlmChat, UserMessage

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
DEFAULT_MODEL = "gemini-3.1-flash-image-preview"


async def generate_tshirt_image(prompt: str) -> str | None:
    """Generate a t-shirt product image via Nano Banana. Returns base64 string, or None on failure."""
    if not EMERGENT_LLM_KEY:
        return None
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"tshirt-{uuid.uuid4().hex[:8]}",
            system_message="You are an expert product photographer AI.",
        )
        chat.with_model("gemini", DEFAULT_MODEL).with_params(modalities=["image", "text"])
        full_prompt = (
            f"High-end editorial streetwear t-shirt product photography. "
            f"{prompt}. Single folded or hanging t-shirt centered on a dark concrete or "
            f"monochrome backdrop. Sharp shadows, magazine-quality lighting, 1:1 aspect, "
            f"no text watermarks, no people."
        )
        msg = UserMessage(text=full_prompt)
        _text, images = await chat.send_message_multimodal_response(msg)
        if images and len(images) > 0:
            return images[0].get("data")
    except Exception as e:
        print(f"[image_gen] error: {e}")
    return None
