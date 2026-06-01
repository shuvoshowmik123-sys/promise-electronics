"""Import conversations 61-78 into Promise Electronics brain DB."""
import requests

BRAIN_API = "https://promise-electronics.vercel.app/api/brain/import-conversations"

PAIRS = [
    # ── #61 Akram Hossain — Sony 48" green color distortion ──────────────────
    {
        "customerMessage": "Ekta sony 48 inch tv screen e sobuz sobuz dag. Thik kora jabe ki? (Customer sent video: full screen green/blue color banding, T-con or panel failure)",
        "ourReply": "WhatsApp number den amra call korbo.",
        "isGoodExample": True,
        "source": "facebook_conv_61_akram",
    },
    {
        "customerMessage": "Sony TV 48 inch screen e sobuz/neel color er dag — full screen color distortion. Panel problem.",
        "ourReply": "স্যার আপনার টিভি রিপেয়ার সম্ভাবনা আছে। WhatsApp number din amra call korbo.",
        "isGoodExample": True,
        "source": "facebook_conv_61_akram",
    },

    # ── #62 Mifta Islam — Samsung 32DN4 model number from back label ──────────
    {
        "customerMessage": "Samsung LED Tv 32 inches. Model number kothay pabo?",
        "ourReply": "স্যার, টিভির পিছনে মডেল নাম্বার দেওয়া আছে। মডেল নাম্বার থেকে একটা ফোন দিয়ে পিকচার তুলে পাঠিয়ে দিন।",
        "isGoodExample": True,
        "source": "facebook_conv_62_mifta",
    },
    {
        "customerMessage": "TV model number kothay likha ache? Ami jani na.",
        "ourReply": "স্যার, টিভির পিছনে স্টিকারে মডেল নাম্বার দেওয়া আছে। একটা ছবি তুলে পাঠান।",
        "isGoodExample": True,
        "source": "facebook_conv_62_mifta",
    },

    # ── #63 Tahmina Porosh — LG 43" display black, sound ok, Khilgaon ────────
    {
        "customerMessage": "LG brand er LED TV. DISPLAY BLACK HOIA GECE. POWER DELE SOUND HOY KINTO FULL DISPLAY BLACK.",
        "ourReply": "জি ম্যাম বুঝতে পারছি। কতো ইঞ্চি টিভি আপনাদের?",
        "isGoodExample": True,
        "source": "facebook_conv_63_tahmina",
    },
    {
        "customerMessage": "LG 43 inch TV. Display black, sound ache. Location Khilgaon.",
        "ourReply": "ম্যাম,আপনার টিভি রিপেয়ার সম্ভবানা আছে, রিপেয়ার জন্য আমাদের সার্ভিস অফিসে নিয়ে আসতে হবে। যোগাযোগ করার জন্য আপনার ফোন নাম্বার দিন আমরা কল করবো। আমাদের সার্ভিস অফিস: লিফট ০৮, হোসেন টাওয়ার, বক্স কালভার্ট রোড, ১১৬ নয়া পল্টন, ঢাকা-১০০০।",
        "isGoodExample": True,
        "source": "facebook_conv_63_tahmina",
    },

    # ── #64 Md Sadekur Rahman — Sony KDL43W750E, auto off/on cycle ───────────
    {
        "customerMessage": "TV auto off hoye abar on hoy abar off hoy. Sony 43 inch. Model KDL43W750E.",
        "ourReply": "স্যার, যোগাযোগ করার জন্য আপনার ফোন নাম্বার দিন আমরা কল করবো। আমাদের সার্ভিস অফিস: লিফট ০৮, হোসেন টাওয়ার, বক্স কালভার্ট রোড, ১১৬ নয়া পল্টন, ঢাকা-১০০০।",
        "isGoodExample": True,
        "source": "facebook_conv_64_sadekur",
    },
    {
        "customerMessage": "TV nijei off hoy pore on hoy — automatic off/on problem. Sony smart TV.",
        "ourReply": "স্যার, কতো ইঞ্চি টিভি আর মডেল নাম্বার দিন — বিস্তারিত বলতে পারবো। ফোন নাম্বার দিন আমরা কল করবো।",
        "isGoodExample": True,
        "source": "facebook_conv_64_sadekur",
    },

    # ── #65 Saha Alom — display broken, address inquiry ───────────────────────
    {
        "customerMessage": "আপনাদের শো রুম কোথায়? আমার টিভির ডিসপ্লে নষ্ট।",
        "ourReply": "স্যার আমাদের সার্ভিস অফিস: লিফট ০৮, হোসেন টাওয়ার, বক্স কালভার্ট রোড, ১১৬ নয়া পল্টন, ঢাকা-১০০০। ফোন: ০১৮৮৬৬৬২৮১১। স্যার, টিভির মডেল সহ সমস্যার একটি ভিডিও দিয়ে সহায়তা করবেন।",
        "isGoodExample": True,
        "source": "facebook_conv_65_saha",
    },

    # ── #66 Abdul Kaium Siddiqui — Samsung AU7700 43", reconditioned panel ────
    {
        "customerMessage": "43 inch Samsung 4k TV model AU7700. Display price koto? Reconditioned display pawa jabe?",
        "ourReply": "স্যার, যোগাযোগ করার জন্য আপনার ফোন নাম্বার দিন আমরা কল করবো। Location kothay?",
        "isGoodExample": True,
        "source": "facebook_conv_66_kaium",
    },
    {
        "customerMessage": "TV second hand kinsi, relocate korte giya nosto hoyeche. Reconditioned display kom takar moddhe khujchi 4K.",
        "ourReply": "স্যার stock check করে জানাবো। Stock থাকলে অবশ্যই call করে জানানো হবে।",
        "isGoodExample": True,
        "source": "facebook_conv_66_kaium",
    },
    # Pricing pair — marked not-good so AI doesn't copy price
    {
        "customerMessage": "Samsung AU7700 43 4K display price. Reconditioned nei?",
        "ourReply": "Sorry sir, reconditioned panel নেই। নতুন panel লাগলে service charge সহ দেখাতে হবে — office এ নিয়ে আসুন, check করে বলবো।",
        "isGoodExample": False,
        "source": "facebook_conv_66_kaium",
    },

    # ── #67 Safiul Azam Limon — Marcel 32" panel cracked both sides ───────────
    {
        "customerMessage": "মার্সেল ৩২\" বেসিক LED টিভি, সাউন্ড আসে কিন্তু পিকচার আসেনা।",
        "ourReply": "স্যার, টিভির মডেল সহ সমস্যার একটি ভিডিও দিয়ে সহায়তা করবেন।",
        "isGoodExample": True,
        "source": "facebook_conv_67_limon",
    },
    {
        "customerMessage": "মিস্ত্রি দেখাইছি। বলছে প্যানেল দুই পাশে কাটা তাই পিকচার আসেনা কিন্তু সাউন্ড আসে।",
        "ourReply": "স্যার টিভি রিপেয়ার হওয়ার সম্ভাবনা আছে আমরা করার চেষ্টা করবো। না হলে টিভি ডিসপ্লে পরিবর্তন করতে হবে।",
        "isGoodExample": True,
        "source": "facebook_conv_67_limon",
    },
    {
        "customerMessage": "Marcel TV 32 inch. Panel cracked on both sides per local technician. Display koto porbe?",
        "ourReply": "স্যার ফোন নাম্বার দেন আমরা কল করবো — সরাসরি কথা বলে বিস্তারিত জানাবো।",
        "isGoodExample": True,
        "source": "facebook_conv_67_limon",
    },

    # ── #68 MD Rubel Khan — 43" TV marks then no picture, sound ok ───────────
    {
        "customerMessage": "আমার 43\" টিভি ইস্ক্রিনে দাগ পরছিল অনেকদিন। এখন ছবি আসে না, কথা (সাউন্ড) আসে।",
        "ourReply": "WhatsApp number den amra call korbo.",
        "isGoodExample": True,
        "source": "facebook_conv_68_rubel",
    },

    # ── #69 Papri Akter — Walton 43" half display, no sound ──────────────────
    {
        "customerMessage": "আমার টিভিতে ডিসপ্লেতে সমস্যা, সাউন্ড আসে না। Walton TV, China made. অনেক দূর থেকে আনতে পারবো না।",
        "ourReply": "ম্যাম, টিভির মডেল সহ সমস্যার একটি ভিডিও দিয়ে সহায়তা করবেন। আমাদের সার্ভিস অফিস: লিফট ০৮, হোসেন টাওয়ার, ১১৬ নয়া পল্টন, ঢাকা-১০০০।",
        "isGoodExample": True,
        "source": "facebook_conv_69_papri",
    },
    {
        "customerMessage": "আপনি কি বাসায় আইসা টিভি ঠিক করে যান? Home service possible?",
        "ourReply": "ম্যাম আমরা বাসায় গিয়ে টিভি ঠিক করি না। আমাদের টিভি রিপেয়ার মেশিন দিয়ে কাজ করতে হয় — office এ নিয়ে আসতে হবে।",
        "isGoodExample": True,
        "source": "facebook_conv_69_papri",
    },
    {
        "customerMessage": "TV half kalo, half ছবি দেখা যায়। সাউন্ড নেই। Walton 43 inch. এত দূরে কিভাবে নিয়ে যাবো?",
        "ourReply": "ম্যাম যোগাযোগ করার জন্য ফোন নাম্বার দিবেন — আমরা কল করবো। নিজে নিয়ে আসতে না পারলে আমাদের pickup & delivery সুবিধা আছে।",
        "isGoodExample": True,
        "source": "facebook_conv_69_papri",
    },

    # ── #70 Md Eliaus — Triton 43" severe purple/pink vertical banding ────────
    {
        "customerMessage": "Triton TV 43\". Customer sent photo & video: entire screen covered in heavy purple/pink vertical color bands — panel or T-con failure.",
        "ourReply": "Sir apner tv repair somvabona ace. Sir WhatsApp number din amra call korbo apnake. আমাদের সার্ভিস অফিস: লিফট ০৮, হোসেন টাওয়ার, ১১৬ নয়া পল্টন, ঢাকা-১০০০।",
        "isGoodExample": True,
        "source": "facebook_conv_70_eliaus",
    },

    # ── #71 Md Saifur Rahman — Sony Bravia W800C 55" 3D, pink color distortion ─
    {
        "customerMessage": "Sony Bravia W800C 55 inch 3D LED TV. Screen e pink/purple color distortion — entire display washed in pink hue. Repair kora jabe?",
        "ourReply": "WhatsApp number den amra call korbo. স্যার আপনার টিভি রিপেয়ার সম্ভবনা বেশি।",
        "isGoodExample": True,
        "source": "facebook_conv_71_saifur",
    },
    {
        "customerMessage": "Sony Bravia 55\" TV screen pink/purple color hoise. Koto taka lagte pare?",
        "ourReply": "স্যার, ফোন নাম্বার দিন আমরা কল করবো — সরাসরি কথা বলে cost জানাবো।",
        "isGoodExample": True,
        "source": "facebook_conv_71_saifur",
    },

    # ── #72 Sufia Dulay — Smart TV vertical color lines (blue/white/pink) ──────
    {
        "customerMessage": "Smart TV screen e severe vertical color lines — blue, white, pink stripes full screen. YouTube app use korte giye erom hoise. Repairing hobe?",
        "ourReply": "ম্যাম আগে কি কোথাও রিপেয়ার করছিলেন? ম্যাম সম্ভব হলে আপনার টিভি মডেল নাম্বার টি বলবেন।",
        "isGoodExample": True,
        "source": "facebook_conv_72_sufia",
    },

    # ── #73 Sajib Reza — TV showing NO SIGNAL with static ────────────────────
    {
        "customerMessage": "TV screen e 'NO SIGNAL' dekhacche with full static/snow pattern. TV te channel dhora jacche na.",
        "ourReply": "WhatsApp number den amra call korbo. আমাদের সার্ভিস অফিস: লিফট ০৮, হোসেন টাওয়ার, ১১৬ নয়া পল্টন, ঢাকা-১০০০।",
        "isGoodExample": True,
        "source": "facebook_conv_73_sajib",
    },

    # ── #74 রিমজিম কুচকুচি — TV intermittent magenta/pink distortion ─────────
    {
        "customerMessage": "আমার টিভি টা এরকম হয় মাজে মাজে (intermittent)। Customer sent 3 photos: severe magenta/pink color banding, entire screen pink-red distorted.",
        "ourReply": "ম্যাম, ফোন নাম্বার দেন আমরা কল করবো। আমাদের সার্ভিস অফিস: লিফট ০৮, হোসেন টাওয়ার, ১১৬ নয়া পল্টন, ঢাকা-১০০০।",
        "isGoodExample": True,
        "source": "facebook_conv_74_rimjim",
    },
    {
        "customerMessage": "TV display majhe majhe pink/magenta color hoe jay — intermittent display problem. Kono kono somoy normal thake.",
        "ourReply": "স্যার/ম্যাম, ভিডিও সহ টিভির মডেল নাম্বার পাঠান — সমস্যা বুঝে জানাবো। ফোন নাম্বার দিন আমরা কল করবো।",
        "isGoodExample": True,
        "source": "facebook_conv_74_rimjim",
    },

    # ── #75 Akir Hossain — Toshiba 40" no picture, sound ok, Banasree ────────
    {
        "customerMessage": "আমার একটি ৪০ ইঞ্চি তসিবা টিভি আছে শুধু পিকচার দেখাবে না, সাউন্ড কোয়ালিটি ঠিক আছে।",
        "ourReply": "স্যার, টিভির মডেল সহ সমস্যার একটি ভিডিও দিয়ে সহায়তা করবেন। স্যার আপনার টিভি রিপেয়ার হতে পারে। রিপেয়ারের জন্য আমাদের সার্ভিস অফিসে নিয়ে আসতে হবে। নিয়ে আসতে না পারলে আমাদের নিজস্ব pickup & delivery সুবিধা আছে।",
        "isGoodExample": True,
        "source": "facebook_conv_75_akir",
    },
    {
        "customerMessage": "Toshiba 40 inch TV — picture nai, sound ache. Repair na hoile charge nai?",
        "ourReply": "স্যার, রিপেয়ার না হলে কোন চার্জ লাগবে না। রিপেয়ার হলে সার্ভিস চার্জ রাখবো। আগে office এ নিয়ে আসুন, দেখে জানাবো।",
        "isGoodExample": True,
        "source": "facebook_conv_75_akir",
    },
    {
        "customerMessage": "এটা কি আপনারা নিয়ে যাবেন নাকি আমাকে নিয়ে আসতে হবে? Location Banasree.",
        "ourReply": "স্যার, আপনি নিয়ে আসলে ভালো হয়। আমরা নিয়ে আসলে transport charge লাগবে।",
        "isGoodExample": True,
        "source": "facebook_conv_75_akir",
    },

    # ── #76 Monir Joy — YouTube not working on TV ─────────────────────────────
    {
        "customerMessage": "amar TV te YouTube kaj korche na.",
        "ourReply": "স্যার, টিভির মডেল সহ সমস্যার একটি ভিডিও দিয়ে সহায়তা করবেন — কোন TV কোন সমস্যা বুঝে জানাবো।",
        "isGoodExample": True,
        "source": "facebook_conv_76_monir",
    },

    # ── #77 MD Shahin Hossain — TV display has two thread-like scratch marks ──
    {
        "customerMessage": "আমার টিভির ডিসপ্লেতে সুতার মত দুইটা দাগ আছে। এটা কি রিমুভ করা সম্ভব?",
        "ourReply": "স্যার, টিভির মডেল সহ সমস্যার একটি ভিডিও দিয়ে সহায়তা করবেন — তাহলে আমরা বুঝতে পারবো।",
        "isGoodExample": True,
        "source": "facebook_conv_77_shahin",
    },
    {
        "customerMessage": "TV display e shutar moto dag — thin line marks on screen. Video pathalam.",
        "ourReply": "স্যার আপনার টিভি রিপেয়ার হওয়ার সম্ভবানা বেশি। WhatsApp number den amra call korbo.",
        "isGoodExample": True,
        "source": "facebook_conv_77_shahin",
    },

    # ── #78 Md Jamal Uddin — Singer 43" (partial, no picture) ────────────────
    {
        "customerMessage": "43 INCH Singer TV — sound ache but picture nai.",
        "ourReply": "স্যার, টিভির মডেল সহ সমস্যার একটি ভিডিও দিয়ে সহায়তা করবেন। ফোন নাম্বার দিন আমরা কল করবো।",
        "isGoodExample": True,
        "source": "facebook_conv_78_jamal",
    },
]


def main():
    print(f"Importing {len(PAIRS)} pairs from conversations 61-78...")
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
