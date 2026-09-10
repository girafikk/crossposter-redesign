import requests
import sys
import json

def send_to_discord(channel_id, message, bot_token):
    """Отправляет сообщение в Discord канал через бота"""
    url = f"https://discord.com/api/v10/channels/{channel_id}/messages"
    headers = {
        "Authorization": f"Bot {bot_token}",
        "Content-Type": "application/json"
    }
    data = {"content": message}
    
    response = requests.post(url, headers=headers, json=data)
    
    if response.status_code == 200:
        return {"success": True, "data": response.json()}
    else:
        return {"success": False, "error": response.text}

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(json.dumps({"success": False, "error": "Недостаточно аргументов: channel_id, message, bot_token"}))
        sys.exit(1)
    
    channel_id = sys.argv[1]
    message = sys.argv[2]
    bot_token = sys.argv[3]
    
    result = send_to_discord(channel_id, message, bot_token)
    print(json.dumps(result))
