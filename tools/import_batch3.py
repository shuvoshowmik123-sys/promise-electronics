"""
Import conversations 41-53 into Promise Electronics brain DB.
Pairs are stored as conversation chunks (multi-turn context) for better retrieval.
"""

import requests
import json

BRAIN_API = "https://promise-electronics.vercel.app/api/brain/import-conversations"

# Each pair stores the FULL TURN CONTEXT in customerMessage so the embedding
# captures the whole diagnostic flow — not just one isolated question.
# This way vector search returns the right chunk in one hit.

PAIRS = [
    # ── #41 Shimul Mustapha — Sony Bravia 48" vertical lines ─────────────────
    {
        "customerMessage": "আমার ব্রাভিয়া ৪৮\" টিভির ডিসপ্লে তে লম্বা লম্বা দাগ আসছে। সারা যাবে?",
        "ourReply": "ম্যাম, আপনার টিভি রিপেয়ার সম্ভাবনা আছে, রিপেয়ার জন্য আমাদের সার্ভিস অফিসে নিয়ে আসতে হবে। স্যার যদি রিপেয়ার হয় তাহলে সার্ভিস খরচ রাখবো আর না হলে সেক্ষেত্রে আমরা কোন খরচ নিবোনা। সেক্ষেত্রে স্যার আপনি রিপেয়ার দিয়ে দেখতে পারেন সেটাই ভালো হয়।",
        "isGoodExample": True,
        "source": "facebook_conv_41_shimul",
    },
    {
        "customerMessage": "Customer sent photo: Sony Bravia 48\" TV screen showing severe vertical line stripes across entire display (panel damage / backlight failure). সারা যাবে?",
        "ourReply": "ম্যাম, আপনার টিভি রিপেয়ার সম্ভাবনা আছে, রিপেয়ার জন্য আমাদের সার্ভিস অফিসে নিয়ে আসতে হবে। যদি রিপেয়ার হয় তাহলে সার্ভিস খরচ রাখবো আর না হলে কোন খরচ নিবোনা।",
        "isGoodExample": True,
        "source": "facebook_conv_41_shimul",
    },

    # ── #42 Md Wasim Hossain — Walton 32" backlight failure ──────────────────
    {
        "customerMessage": "আমার টিভি কালো হয়ে গেছে, বাসায় এসে ঠিক করে দিতে পারবেন?",
        "ourReply": "স্যার আপনার টিভি যে সমস্যা সেটা বাসায় গিয়ে ঠিক করার মতো না। স্যার, টিভির মডেল সহ সমস্যার একটি ভিডিও দিয়ে সহায়তা করবেন।",
        "isGoodExample": True,
        "source": "facebook_conv_42_wasim",
    },
    {
        "customerMessage": "ওয়ালটন ৩২\" টিভি, কালো হয়ে গেছে। ঘরের লাইট বন্ধ করে মোবাইলের টর্চ লাইট জ্বালিয়ে টিভির সামনে ধরলে ছবি দেখা যায়।",
        "ourReply": "স্যার আপনার ঠিকানা কোথায়? স্যার, যোগাযোগ করার জন্য আপনার ফোন নাম্বার দিন আমরা কল করবো।",
        "isGoodExample": True,
        "source": "facebook_conv_42_wasim",
    },
    {
        "customerMessage": "Tv screen black but sound is working. When I shine torch in dark room I can see picture faintly. Walton 32 inch.",
        "ourReply": "স্যার এটা ব্যাকলাইট সমস্যা। বাসায় গিয়ে ঠিক করার মতো না — আমাদের সার্ভিস অফিসে নিয়ে আসলে দেখবো। ফোন নাম্বার দিন আমরা কল করবো।",
        "isGoodExample": True,
        "source": "facebook_conv_42_wasim",
    },

    # ── #43 Munia Farhana — MI 55" total black screen ────────────────────────
    {
        "customerMessage": "mi 55\" led tv, eta thik kora jabe? Full black screen, sound ache.",
        "ourReply": "জি স্যার বুঝতে পারছি। স্যার/ম্যাম, আগে কি টিভি রিপেয়ার করা হয়েছিল বা কোথাও দেখাইছিলেন রিপেয়ার জন্য?",
        "isGoodExample": True,
        "source": "facebook_conv_43_munia",
    },
    {
        "customerMessage": "2022 e ek bar dekhaisilam, pore thik hoye gesilo. Then 2025 june e emon hoise. Full black hoye gesilo.",
        "ourReply": "জি স্যার বুঝতে পেরেছি। স্যার, যোগাযোগ করার জন্য আপনার ফোন নাম্বার দিন আমরা কল করবো।",
        "isGoodExample": True,
        "source": "facebook_conv_43_munia",
    },

    # ── #44 Mamun Rashid — Sony X8000E 43" (previously repaired, same problem) ─
    {
        "customerMessage": "এটা কি রিপেয়ার করা সম্ভব হবে? (Sony X8000E 43\" TV)",
        "ourReply": "হ্যা সম্ভব। স্যার, টিভির মডেল সহ সমস্যার একটি ভিডিও দিয়ে সহায়তা করবেন।",
        "isGoodExample": True,
        "source": "facebook_conv_44_mamun",
    },
    {
        "customerMessage": "Sony X8000E 43\". আগে একবার রিপেয়ার করা হয়েছিল আবার এই সমস্যা হয়েছে। আমার টিভি কি রিপেয়ার করা সম্ভব?",
        "ourReply": "স্যার, যোগাযোগ করার জন্য আপনার ফোন নাম্বার দিন আমরা কল করবো। সরাসরি কথা বলে বিস্তারিত জানবো।",
        "isGoodExample": True,
        "source": "facebook_conv_44_mamun",
    },

    # ── #46 Md Shafikul Islam — YouTube not supported on old TV ──────────────
    {
        "customerMessage": "Customer TV shows error: 'YouTube is not supported on this device' — old smart TV model.",
        "ourReply": "Sir, ai problem akhono amra samadhan paini. Jodi samadhan pai apnake janano hoba. Apnar phone number dia rakhen.",
        "isGoodExample": True,
        "source": "facebook_conv_46_shafikul",
    },
    {
        "customerMessage": "এই সমস্যাটার কারণ কি? (YouTube not supported on TV)",
        "ourReply": "Sir, old version TV-তে এই সমস্যা বেশি হয়। YouTube তাদের পুরনো ডিভাইসের support বন্ধ করে দিয়েছে।",
        "isGoodExample": True,
        "source": "facebook_conv_46_shafikul",
    },
    {
        "customerMessage": "YouTube আর চলছে না টিভিতে, এ সমস্যার কারণে অপেক্ষা করা ছাড়া আর কিছু করার আছে?",
        "ourReply": "স্যার, এটা hardware সমস্যা না — YouTube পুরনো TV support বন্ধ করেছে। কিছুদিন অপেক্ষা করেন, সমাধান পেলে জানাবো। ফোন নাম্বার রেখে দিন।",
        "isGoodExample": True,
        "source": "facebook_conv_46_shafikul",
    },

    # ── #47 Shaheen AL Mehedi — 32" TV first problem ─────────────────────────
    {
        "customerMessage": "আমার ৩২\" টিভিতে সমস্যা হয়েছে, এটাই প্রথমবার সমস্যা হলো। আগে কোথাও দেখাইনি।",
        "ourReply": "স্যার, যোগাযোগ করার জন্য আপনার ফোন নাম্বার দিন আমরা কল করবো। আমাদের সার্ভিস অফিস: লিফট ০৮, হোসেন টাওয়ার, বক্স কালভার্ট রোড, ১১৬ নয়া পল্টন, ঢাকা-১০০০।",
        "isGoodExample": True,
        "source": "facebook_conv_47_shaheen",
    },

    # ── #48 Shaiful Alam Sayem — Jolili TV vertical lines, Bashundhara ───────
    {
        "customerMessage": "Customer sent 5 photos: Jolili TV screen showing severe vertical stripe damage on display panel. First time damage, no previous repair.",
        "ourReply": "ম্যাম, আপনার টিভি রিপেয়ার সম্ভাবনা আছে, রিপেয়ার জন্য আমাদের সার্ভিস অফিসে নিয়ে আসতে হবে। স্যার, যোগাযোগ করার জন্য আপনার ফোন নাম্বার দিন আমরা কল করবো।",
        "isGoodExample": True,
        "source": "facebook_conv_48_shaiful",
    },
    {
        "customerMessage": "টিভির ডিসপ্লেতে লম্বা দাগ আসছে (vertical lines), আগে কখনো রিপেয়ার করা হয়নি। Location Bashundhara.",
        "ourReply": "ম্যাম, আপনার টিভি রিপেয়ার সম্ভাবনা আছে। রিপেয়ার জন্য আমাদের সার্ভিস অফিসে নিয়ে আসতে হবে। ফোন নাম্বার দিন আমরা কল করবো।",
        "isGoodExample": True,
        "source": "facebook_conv_48_shaiful",
    },

    # ── #49 Ashraful Islam Himel — Samsung 49" backlight + no home service ───
    {
        "customerMessage": "Picture asa na kintu sound ase. Samsung 49\" TV. Screen e white mark asa na. Repair costing koto hoba? Location Uttara.",
        "ourReply": "স্যার আপনার টিভির যে সমস্যা তা অনুগ্রহ করে মডেল সহ ভিডিও করে পাঠাবেন। আমরা চেক করে আনুমানিক রিপেয়ারিং চার্জ জানিয়ে দিবো।",
        "isGoodExample": True,
        "source": "facebook_conv_49_himel",
    },
    {
        "customerMessage": "Sound ache but no picture on Samsung TV. When torch is shined on screen in dark room image is faintly visible — backlight failure.",
        "ourReply": "স্যার এই টিভিতে দুই ধরনের সমস্যা হতে পারে: ১। ব্যাকলাইট নষ্ট ২। ডিসপ্লে সমস্যা — যেটা ডিজিটাল লেজার মেশিনে রিপেয়ার হয়। টিভি আমাদের সার্ভিস অফিসে নিয়ে আসলে বুঝতে পারবো কি সমস্যা।",
        "isGoodExample": True,
        "source": "facebook_conv_49_himel",
    },
    {
        "customerMessage": "Apnara ki basay eshe thik kora diban? Home service possible?",
        "ourReply": "স্যার/ম্যাম, আমরা যেসব সমস্যা রিপেয়ার করি সেগুলো হোম সার্ভিসে বা বাসায় গিয়ে রিপেয়ার করা সম্ভব না। বাসায় গিয়ে কাজ ভালো হয় না।",
        "isGoodExample": True,
        "source": "facebook_conv_49_himel",
    },
    {
        "customerMessage": "Home service possible na, TV niye jawa possible na amar pক্ষে।",
        "ourReply": "Sir amader home service hoba na. Amader nijosso gari ache — pickup & delivery hoba. Apner TV niye asbe & dia asbe. Amader mul lokko hocche TV thikoi repair — tk tw jekhane repair koren na kno dity hoba.",
        "isGoodExample": True,
        "source": "facebook_conv_49_himel",
    },

    # ── #50 Shakil Rana Swadhin — display suddenly dark blue/black ───────────
    {
        "customerMessage": "টিভি দেখতে দেখতে হঠাৎ করে ডিসপ্লে টা একেবারে কালো নীল হয়ে গেছে। এখন অন করলে বোঝা যায় না কিন্তু অফ করলে বোঝা যায় যে কিছু অফ হইল — একেবারে কালো হয়ে যায়।",
        "ourReply": "স্যার, যোগাযোগ করার জন্য আপনার ফোন নাম্বার দিন আমরা কল করবো।",
        "isGoodExample": True,
        "source": "facebook_conv_50_shakil",
    },

    # ── #51 Anik Tusher — LG UM7300PTA 43" vertical lines, local shop failed ──
    {
        "customerMessage": "LG webOS TV UM7300PTA 43\". Alakar dokane dekhano hoisilo, try korsa but thik korte parenai. Display-e vertical color lines ache.",
        "ourReply": "স্যার, যোগাযোগ করার জন্য আপনার ফোন নাম্বার দিন আমরা কল করবো। আমাদের মেশিনে ডিসপ্লে লাইন রিপেয়ার সম্ভব যেখানে অন্য জায়গায় হয়নি।",
        "isGoodExample": True,
        "source": "facebook_conv_51_anik",
    },
    {
        "customerMessage": "LG TV 43\" display-e vertical stripes/lines. Local shop tried but couldn't fix it.",
        "ourReply": "স্যার/ম্যাম, আমাদের ডিজিটাল লেজার মেশিনে ডিসপ্লে লাইন রিপেয়ার করা হয়। আগে কোথাও না হলেও আমাদের কাছে সম্ভব হতে পারে। মডেল নাম্বার দিন, ফোন নাম্বার দিন — আমরা কল করবো।",
        "isGoodExample": True,
        "source": "facebook_conv_51_anik",
    },

    # ── #52 Kamal Sheikh — repeated inquiries, phone call resolution ──────────
    {
        "customerMessage": "সেদিন টিভির পিকচার দেখাইলাম মডেল নাম্বার দিলাম তা তো কিছু জানালেন না।",
        "ourReply": "স্যার, ফোন নাম্বার দিন আমরা সরাসরি কথা বলবো। আমাদের সার্ভিস অফিস: লিফট ০৮, হোসেন টাওয়ার, বক্স কালভার্ট রোড, ১১৬ নয়া পল্টন, ঢাকা-১০০০।",
        "isGoodExample": True,
        "source": "facebook_conv_52_kamal",
    },

    # ── #53 Shouvon Ar — LG 43" unknown issue (video sent) ───────────────────
    {
        "customerMessage": "Customer sent video showing LG TV 43\" problem. Tv ta ei somossa dicche. Eta thik kora jabe?",
        "ourReply": "স্যার টিভি মডেল নাম্বার দিয়ে সহায়তা করুন তাহলে আমরা বিস্তারিত বলতে পারবো।",
        "isGoodExample": True,
        "source": "facebook_conv_53_shouvon",
    },
]


def main():
    print(f"Importing {len(PAIRS)} pairs from conversations 41–53...")
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
