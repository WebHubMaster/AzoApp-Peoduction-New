import json, urllib.request

B = "http://localhost:8001/api"
TOKEN = open("/tmp/admintoken.txt").read().strip()

def req(method, path, body=None, auth=True):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(B + path, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    if auth:
        r.add_header("Authorization", "Bearer " + TOKEN)
    with urllib.request.urlopen(r) as resp:
        return json.loads(resp.read().decode())

cfg = req("GET", "/admin/app-home")
sid = "teststory1"
cfg["custom_sections"] = [{
    "id": sid, "enabled": True, "type": "stories", "title": "Watch Stories", "icon": "sparkles",
    "stories": [
        {"id": "s1", "enabled": True, "title": "Deep Clean", "avatar": "https://picsum.photos/80",
         "poster": "https://picsum.photos/300/500", "video": "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4",
         "cta_label": "Book Now", "cta_link": "/services"},
        {"id": "s2", "enabled": True, "title": "Salon at Home", "avatar": "", "poster": "https://picsum.photos/301/500",
         "video": "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4", "cta_label": "", "cta_link": ""},
        {"id": "s3", "enabled": False, "title": "Disabled one", "poster": "https://picsum.photos/302/500", "video": ""},
    ],
}]
cfg["sections"].append({"key": f"custom:{sid}", "enabled": True})
saved = req("PUT", "/admin/app-home", cfg)
print("SAVED custom_sections count:", len(saved.get("custom_sections", [])))

home = req("GET", "/app/home", auth=False)
story_secs = [s for s in home.get("sections", []) if s.get("custom_type") == "stories"]
print("PUBLIC stories sections:", len(story_secs))
if story_secs:
    s = story_secs[0]
    print("  title:", s.get("title"))
    print("  story count (enabled+has media):", len(s.get("data", [])))
    for st in s.get("data", []):
        print("   -", st.get("title"), "| video?", bool(st.get("video")), "| cta:", st.get("cta_link"))
print("RESULT:", "PASS" if story_secs and len(story_secs[0]["data"]) == 2 else "FAIL")
