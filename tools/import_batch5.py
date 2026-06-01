"""Import conversations 11-20 (cleaned) into Promise Electronics brain DB.
Skipped: conv_11 (no useful pairs), conv_14 (no useful pairs), conv_15 (paraphrased replies — not real dialogue).
"""
import requests

BRAIN_API = "https://promise-electronics.vercel.app/api/brain/import-conversations"

PAIRS = [
    # ── #12 Daniel — physically damaged display, replacement needed ──────────
    {
        "customerMessage": "আমার টিভির সমস্যা — আপনারা কি ঠিক করতে পারবেন? [Customer then sent a 0:15 video showing TV display damage]",
        "ourReply": "স্যার আপনার টিভিটা মূলত ফিজিক্যালি ড্যামেজ হয়ে গেছে সে ক্ষেত্রে আপনার টিভিটা রিপিয়ার হবে না। টিভি ডিসপ্লে রিপ্লেস করতে হবে",
        "isGoodExample": True,
        "source": "facebook_conv_12_daniel",
    },
    {
        "customerMessage": "কতো টাকা লাগবে?",
        "ourReply": "সার্ভিস সহ নতুন ডিসপ্লে ১৬,০০০ টাকা। সাথে ছয় মাসের ওয়ারেন্টি।",
        "isGoodExample": False,
        "source": "facebook_conv_12_daniel",
    },

    # ── #13 Rahman — 65" panel change ────────────────────────────────────────
    {
        "customerMessage": "panel change korte hobe",
        "ourReply": "আমাদের স্টক দেখে আপনাকে জানাতে হবে",
        "isGoodExample": True,
        "source": "facebook_conv_13_rahman",
    },
    {
        "customerMessage": "panel change korte hobe [65 inch TV]",
        "ourReply": "স্যার আপনার ৬৫ ইঞ্চি টিভি নতুন প্যানেল লাগালে ৪৮,০০০ টাকা খরচ পড়বে সার্ভিস বিল সহ।",
        "isGoodExample": False,
        "source": "facebook_conv_13_rahman",
    },

    # ── #16 Rafee — voice message, repair estimate ───────────────────────────
    {
        "customerMessage": "[VOICE MESSAGE: 0:22, 0:09, 0:11, 0:06 — multiple clips describing TV issue]. Customer wants repair estimate.",
        "ourReply": "যদি রিপেয়ার হয় ৫৫০০–৭০০০ টাকা। না হলে কোনো চার্জ নেই।",
        "isGoodExample": False,
        "source": "facebook_conv_16_rafee",
    },

    # ── #17 Sani — display damage check, 32" price inquiry ───────────────────
    {
        "customerMessage": "Display change na kore — Eta thik kora jabe?",
        "ourReply": "স্যার আপনার টিভির মূলত ডিসপ্লে ড্যামেজ হয়েছে কিনা সেটা চেক করতে হবে — অফিসে নিয়ে আসতে হবে",
        "isGoodExample": True,
        "source": "facebook_conv_17_sani",
    },
    {
        "customerMessage": "৩২ ইঞ্চি, HD — দাম কত পড়বে?",
        "ourReply": "4K display = ১৭,৫০০ টাকা। Full HD display = ১৫,৫০০ টাকা। সার্ভিস চার্জ সহ।",
        "isGoodExample": False,
        "source": "facebook_conv_17_sani",
    },

    # ── #18 Rashidul — panel gone, warranty ──────────────────────────────────
    {
        "customerMessage": "Panel's naki chole gase",
        "ourReply": "আপনার টিভি সার্ভিস ৮,৫০০ টাকা খরচ পড়বে।",
        "isGoodExample": False,
        "source": "facebook_conv_18_rashidul",
    },
    {
        "customerMessage": "Kono warranty ase?",
        "ourReply": "ছয় মাসের ওয়ারেন্টি — কেউ দেয় না, আমরা দিই",
        "isGoodExample": True,
        "source": "facebook_conv_18_rashidul",
    },

    # ── #19 Shohag — Walton 44" panel, model number request ──────────────────
    {
        "customerMessage": "Ei pannel tah thik korano Jabe walton 44\"? [Customer sent 0:10 video showing TV panel issue]",
        "ourReply": "স্যার টিভির পিছনে দেখেন স্টিকার মডেল নম্বর লেখা আছে — একটি পিকচার তুলে দেন",
        "isGoodExample": True,
        "source": "facebook_conv_19_shohag",
    },

    # ── #20 Vincent — display diagnosis, no home service, repair cost ─────────
    {
        "customerMessage": "Tb repair korbo — [Customer sent 0:46 video showing TV display issue]",
        "ourReply": "স্যার আপনার টিভির মূলত ডিসপ্লের সমস্যা",
        "isGoodExample": True,
        "source": "facebook_conv_20_vincent",
    },
    {
        "customerMessage": "Home service deya hoi?",
        "ourReply": "ডিসপ্লে রিপিয়ার করার জন্য বড় বড় মেশিনের প্রয়োজন হয় সেটা বাসায় করা সম্ভব না — অফিসে নিয়ে আসতে হবে",
        "isGoodExample": True,
        "source": "facebook_conv_20_vincent",
    },
    {
        "customerMessage": "রিপেয়ার হলে কত খরচ হবে?",
        "ourReply": "রিপেয়ার হলে ৪,০০০ টাকা খরচ পরবে — না হলে কোন খরচ নিতে হবে না",
        "isGoodExample": False,
        "source": "facebook_conv_20_vincent",
    },
]


def main():
    print(f"Importing {len(PAIRS)} pairs from conversations 12-20 (cleaned)...")
    r = requests.post(
        BRAIN_API,
        json={"pairs": PAIRS},
        headers={"Content-Type": "application/json"},
        timeout=90,
    )
    data = r.json()
    if data.get("success"):
        print(f"[OK] Inserted: {data.get('inserted')} pairs")
        print(f"     Skipped (duplicates): {data.get('skipped', 0)}")
    else:
        print(f"[ERR] {data}")


if __name__ == "__main__":
    main()
