"""
Gera os ícones do app da Fazenda a partir do símbolo da Carvalho Cruz, com a
faixa verde "FAZENDA" embaixo — para não confundir com o app da Distribuidora.

  entrada: brand/logo-simbolo.png, public/logo-carvalho-cruz.png
  saída:   public/pwa-192x192.png, pwa-512x512.png, pwa-maskable-512x512.png,
           apple-touch-icon.png, favicon.svg, logo-fazenda.png

Rode com: python3 scripts/gerar-icones.py   (precisa do Pillow)
"""
import base64
import io
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parent.parent
PUBLIC = RAIZ / "public"
CREME = (250, 250, 247, 255)
VERDE = (0x1D, 0x45, 0x30, 255)
FONTE = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

simbolo = Image.open(RAIZ / "brand/logo-simbolo.png").convert("RGBA")


def faixa(im, caixa, texto="FAZENDA"):
    """Faixa verde arredondada com o texto centralizado dentro de `caixa`."""
    d = ImageDraw.Draw(im)
    x0, y0, x1, y1 = caixa
    d.rounded_rectangle(caixa, radius=(y1 - y0) * 0.24, fill=VERDE)
    tam = int((y1 - y0) * 0.62)
    while True:
        f = ImageFont.truetype(FONTE, tam)
        l, t, r, b = d.textbbox((0, 0), texto, font=f)
        if r - l <= (x1 - x0) * 0.86 or tam < 8:
            break
        tam -= 1
    d.text(((x0 + x1 - (r - l)) / 2 - l, (y0 + y1 - (b - t)) / 2 - t), texto, font=f, fill=(255, 255, 255, 255))


def icone(lado, escala=1.0):
    """Símbolo em cima, faixa embaixo. `escala` < 1 encolhe tudo (maskable)."""
    im = Image.new("RGBA", (lado, lado), CREME)
    util = lado * escala
    margem = (lado - util) / 2
    h = int(util * 0.58)
    w = int(simbolo.width * h / simbolo.height)
    im.alpha_composite(simbolo.resize((w, h), Image.LANCZOS), (int((lado - w) / 2), int(margem + util * 0.06)))
    faixa(im, (int(margem + util * 0.08), int(margem + util * 0.70), int(margem + util * 0.92), int(margem + util * 0.90)))
    return im


def salvar(im, nome, lado=None):
    if lado:
        im = im.resize((lado, lado), Image.LANCZOS)
    im.save(PUBLIC / nome, optimize=True)


grande = icone(512)
salvar(grande, "pwa-512x512.png")
salvar(grande, "pwa-192x192.png", 192)
salvar(icone(512, escala=0.78), "pwa-maskable-512x512.png")
salvar(grande.convert("RGB"), "apple-touch-icon.png", 180)

buf = io.BytesIO()
grande.resize((128, 128), Image.LANCZOS).save(buf, format="PNG", optimize=True)
(PUBLIC / "favicon.svg").write_text(
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 128 128" role="img" aria-label="Fazenda Carvalho Cruz">\n'
    f'  <image width="128" height="128" href="data:image/png;base64,{base64.b64encode(buf.getvalue()).decode()}"/>\n</svg>\n'
)

# Logo da tela de login: a logo completa com a faixa FAZENDA embaixo.
logo = Image.open(PUBLIC / "logo-carvalho-cruz.png").convert("RGBA")
alt = int(logo.height * 0.2)
tela = Image.new("RGBA", (logo.width, logo.height + alt), (0, 0, 0, 0))
tela.alpha_composite(logo, (0, 0))
faixa(tela, (int(logo.width * 0.12), logo.height + int(alt * 0.12), int(logo.width * 0.88), logo.height + int(alt * 0.88)))
tela.save(PUBLIC / "logo-fazenda.png", optimize=True)
print("ícones gerados")
