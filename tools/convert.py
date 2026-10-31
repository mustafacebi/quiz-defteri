"""
kaynak/*.txt dosyalarını okuyup data/questions.js dosyasını üretir.

Kullanım (proje klasöründeyken):
    python3 tools/convert.py

Script sonunda bir kontrol raporu basar. "SORUNLAR" bölümü boş değilse
.txt dosyasında düzeltilmesi gereken bir şey var demektir.
"""
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES = [
    ("yeni", "Yeni Quizler", ROOT / "kaynak" / "quiz_derleme_yeni.txt"),
    ("eski", "Eski Quizler", ROOT / "kaynak" / "quiz_derleme_eski.txt"),
]
OUT = ROOT / "data" / "questions.js"

# Satır kalıpları (regex)
RE_TITLE = re.compile(r"^(?:YENİ\s+)?QUIZ\s+(\d+)\s*-\s*(.*?)\s*\(Bölüm\s+(\d+)\)\s*$")
RE_QUESTION = re.compile(r"^(\d+)\)\s+(.*)")                      # "12) Soru metni"
RE_OPTION = re.compile(r"^\s+\[( |✔)\]\s*(?:([a-dA-D])\)\s*)?(.*)")  # "   [✔] b) Şık"
RE_ANSWER = re.compile(r"^\s*✔ Cevap:\s*(.*)")                    # "   ✔ Cevap: b) ..."
RE_KONTROL = re.compile(r"\[kontrol et\s*(?:-\s*([^\]]*))?\]")    # "[kontrol et - not]"
RE_LIST_ITEM = re.compile(r"^(-|•|\d+\.)\s")                      # "- madde" / "1. madde"


def join_lines(lines):
    """Satır sonlarından bölünmüş metni birleştirir; liste maddelerini ayrı satırda tutar."""
    out = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if out and not RE_LIST_ITEM.match(line):
            out[-1] += " " + line
        else:
            out.append(line)
    return "\n".join(out)


def split_explanation(body):
    """'b) Ahlak  (Açıklama.)' -> ('b) Ahlak', 'Açıklama.')"""
    idx = body.find("(")
    if idx == -1:
        return body.strip(), ""
    label, expl = body[:idx].strip(), body[idx:].strip()
    # Dıştaki parantez tüm metni sarıyorsa onu kaldır
    depth = 0
    for i, ch in enumerate(expl):
        depth += ch == "("
        depth -= ch == ")"
        if depth == 0:
            if i == len(expl) - 1:
                expl = expl[1:-1].strip()
            break
    return label, expl


def finish_question(q, problems, where):
    """Toplanan ham satırlardan sorunun son halini üretir ve kontrol eder."""
    q["text"] = join_lines(q.pop("_text"))
    body_lines = q.pop("_answer")
    opts = q.pop("_opts")

    body = "\n".join(body_lines)
    notes = [m.group(1).strip() for m in RE_KONTROL.finditer(body) if m.group(1)]
    q["uncertain"] = bool(RE_KONTROL.search(body))
    q["uncertainNote"] = " ".join(notes)
    body_lines = [RE_KONTROL.sub("", l) for l in body_lines]

    if not opts:
        q["type"] = "open"
        q["options"] = []
        q["answer"] = None
        q["explanation"] = join_lines(body_lines)
        if not q["explanation"]:
            problems.append(f"{where}: açık uçlu sorunun cevabı yok")
        return q

    texts = [t for _, _, t in opts]
    q["type"] = "tf" if texts == ["Doğru", "Yanlış"] else "mc"
    q["options"] = texts
    correct = [i for i, (mark, _, _) in enumerate(opts) if mark == "✔"]
    if len(correct) != 1:
        problems.append(f"{where}: {len(correct)} tane [✔] var (1 olmalı)")
    q["answer"] = correct[0] if correct else None

    if q["type"] == "mc":
        if len(opts) != 4 or any(letter is None for _, letter, _ in opts):
            problems.append(f"{where}: şıklar a-d düzeninde değil")

    label, expl = split_explanation(join_lines(body_lines))
    q["explanation"] = expl

    # Çapraz kontrol: "Cevap:" satırı [✔] işaretiyle aynı şıkkı mı söylüyor?
    if q["answer"] is not None:
        if q["type"] == "tf":
            expected = texts[q["answer"]].upper()
            if not label.upper().startswith(expected):
                problems.append(f"{where}: Cevap '{label}' ama [✔] '{texts[q['answer']]}'")
        else:
            letter = opts[q["answer"]][1]
            # Cevap satırı ya harfle ("c) ...") ya da doğrudan şık metniyle yazılmış olabilir
            by_letter = label.lower().startswith(letter.lower() + ")")
            by_text = label.lower() == texts[q["answer"]].lower()
            if not (by_letter or by_text):
                problems.append(f"{where}: Cevap '{label[:30]}' ama [✔] şık {letter})")
    return q


def parse(source_id, path, problems, leftovers):
    lines = path.read_text(encoding="utf-8").split("\n")
    quizzes = []
    quiz = q = None
    mode = None  # "summary" | "question" | "answer" | None

    def close_question():
        nonlocal q
        if q is not None:
            where = f"{source_id} quiz {quiz['no']} soru {q['no']}"
            quiz["questions"].append(finish_question(q, problems, where))
            q = None

    i = 0
    while i < len(lines):
        raw = lines[i]
        s = raw.strip()

        # Quiz başlığı: ==== / başlık / ====
        if s.startswith("====") and i + 2 < len(lines) and lines[i + 2].strip().startswith("===="):
            close_question()
            m = RE_TITLE.match(lines[i + 1].strip())
            if not m:
                problems.append(f"{source_id}: başlık okunamadı: {lines[i + 1].strip()}")
                i += 3
                continue
            quiz = {
                "id": f"{source_id}-{m.group(1)}",
                "no": int(m.group(1)),
                "chapter": int(m.group(3)),
                "title": m.group(2),
                "_summary": [],
                "questions": [],
            }
            quizzes.append(quiz)
            mode = "summary"
            i += 3
            continue

        if quiz is None:  # dosya başındaki açıklama bloğu
            i += 1
            continue

        if s.startswith("-----"):  # "----- DOĞRU / YANLIŞ -----" gibi bölüm ayırıcı
            close_question()
            mode = None
        elif (m := RE_QUESTION.match(raw)):
            close_question()
            q = {"id": f"{quiz['id']}-{m.group(1)}", "no": int(m.group(1)),
                 "_text": [m.group(2)], "_opts": [], "_answer": []}
            mode = "question"
        elif q is not None and mode == "question" and (m := RE_OPTION.match(raw)):
            q["_opts"].append((m.group(1).strip() or " ", m.group(2), m.group(3).strip()))
        elif q is not None and (m := RE_ANSWER.match(raw)):
            q["_answer"].append(m.group(1))
            mode = "answer"
        elif not s:
            if mode == "answer":
                mode = None  # cevap bloğu bitti
        elif mode == "summary":
            quiz["_summary"].append(s)
        elif mode == "question" and not q["_opts"]:
            q["_text"].append(s)  # birden fazla satıra yayılan soru metni
        elif mode == "answer":
            q["_answer"].append(s)
        else:
            leftovers.append(f"{source_id} quiz {quiz['no']} satır {i + 1}: {s}")
        i += 1

    close_question()
    for qz in quizzes:
        qz["summary"] = join_lines(qz.pop("_summary"))
    return quizzes


def main():
    problems, leftovers = [], []
    data = {"sources": []}
    for source_id, title, path in SOURCES:
        quizzes = parse(source_id, path, problems, leftovers)
        data["sources"].append({"id": source_id, "title": title, "quizzes": quizzes})

    OUT.write_text(
        "// Bu dosya tools/convert.py tarafından üretilir. Elle düzenleme;\n"
        "// kaynak/*.txt dosyasını düzeltip script'i yeniden çalıştır.\n"
        "window.QUIZ_DATA = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n",
        encoding="utf-8",
    )

    # ---- Kontrol raporu ----
    print("KONTROL RAPORU")
    for src in data["sources"]:
        total = Counter()
        print(f"\n{src['title']}:")
        for qz in src["quizzes"]:
            c = Counter(x["type"] for x in qz["questions"])
            unc = sum(x["uncertain"] for x in qz["questions"])
            total.update(c)
            total["uncertain"] += unc
            print(f"  Quiz {qz['no']:>2} {qz['title'][:38]:<38} {len(qz['questions']):>3} soru  "
                  f"mc={c['mc']:>2} dy={c['tf']:>2} açık={c['open']}  kontrol={unc}"
                  f"{'  [özet var]' if qz['summary'] else ''}")
        n = total["mc"] + total["tf"] + total["open"]
        print(f"  TOPLAM: {n} soru (mc={total['mc']}, dy={total['tf']}, açık={total['open']}, "
              f"kontrol={total['uncertain']})")

        texts = Counter(x["text"] for qz in src["quizzes"] for x in qz["questions"])
        for t, c in texts.items():
            if c > 1:
                print(f"  tekrar ({c}x): {t[:70]}")

    print("\nSORUNLAR:", "yok" if not problems else "")
    for p in problems:
        print("  -", p)
    print("\nHİÇBİR YERE UYMAYAN SATIRLAR:", "yok" if not leftovers else "")
    for l in leftovers:
        print("  -", l)
    print(f"\nYazıldı: {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
