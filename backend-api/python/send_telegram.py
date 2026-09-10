#!/usr/bin/env python3
import sys
import json
import urllib.request
import urllib.parse

# ВАШ ТОКЕН БОТА (из @BotFather)
TOKEN = "7576647963:AAFWvz6zgzf7h5tjiBQUVjHL50f3Ag0ru3o"

def send_message(chat_id, text):
    """Отправляет сообщение через Telegram Bot API (без сторонних библиотек)"""
    
    # Очищаем chat_id (убираем @ если есть, но оставляем для публичных каналов)
    if chat_id.startswith('@'):
        # Для публичных каналов оставляем @
        pass
    
    url = f"https://api.telegram.org/bot{TOKEN}/sendMessage"
    
    # Подготавливаем данные
    data = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML"
    }
    
    # Кодируем данные
    post_data = urllib.parse.urlencode(data).encode('utf-8')
    
    try:
        # Отправляем запрос
        req = urllib.request.Request(url, data=post_data, method='POST')
        req.add_header('Content-Type', 'application/x-www-form-urlencoded')
        
        with urllib.request.urlopen(req, timeout=10) as response:
            result = json.loads(response.read().decode('utf-8'))
            
            if result.get("ok"):
                return {
                    "success": True,
                    "message_id": result["result"]["message_id"],
                    "chat_id": result["result"]["chat"]["id"]
                }
            else:
                return {
                    "success": False,
                    "error": result.get("description", "Unknown error")
                }
                
    except urllib.error.URLError as e:
        return {"success": False, "error": f"Network error: {e.reason}"}
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"success": False, "error": "Недостаточно аргументов"}))
        sys.exit(1)
    
    chat_id = sys.argv[1]
    text = sys.argv[2]
    
    result = send_message(chat_id, text)
    print(json.dumps(result))
