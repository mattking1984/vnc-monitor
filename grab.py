import asyncio
import asyncvnc
from PIL import Image

PI_IP = "192.168.1.136"  # your Pi's actual IP

async def grab():
    async with asyncvnc.connect(PI_IP, 5900) as client:
        pixels = await client.screenshot()      # numpy array (H, W, 4)
        img = Image.fromarray(pixels[:, :, :3]) # drop alpha
        img.save("pi_frame.png")
        print(f"Grabbed {img.size} frame")

asyncio.run(grab())