' NotebookLM MCP Server - Démarrage silencieux
' Lance le serveur HTTP sans fenêtre visible
' Pour démarrage automatique : ajouter au dossier Démarrage Windows

Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "D:\Claude\notebooklm-mcp-http"

' Définir les variables d'environnement
Set WshEnv = WshShell.Environment("Process")
WshEnv("DATA_DIR") = "C:\Users\romai\AppData\Local\notebooklm-mcp\Data"

' Lancer le serveur en mode caché (0 = hidden)
WshShell.Run "node dist/http-wrapper.js", 0, False
