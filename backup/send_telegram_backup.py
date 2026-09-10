import logging
from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, filters, ContextTypes

TOKEN = "7576647963:AAFWvz6zgzf7h5tjiBQUVjHL50f3Ag0ru3o"

logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
                    level=logging.INFO)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    menu_text = (
        "Я бот для проверки работы API телеграма.\n"
        "Я могу:\n"
        "/start - Начать работу с ботом\n"
        "/help - Помощь\n"
    )
    await update.message.reply_text(menu_text)

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text('Пока я не могу ни с чем помочь.')

async def echo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = update.message.text
    await update.message.reply_text(f'Да.')

async def error_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    logging.error(f'Update {update} caused error {context.error}')

def main():
    application = ApplicationBuilder().token(TOKEN).build()

    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("help", help_command))  # Исправлено добавление обработчика команды
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, echo))
    application.add_error_handler(error_handler)  # Обработчик ошибок добавляется отдельно

    application.run_polling()

if __name__ == '__main__':
    main()


