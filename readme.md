# Computing Historian Agent (Microsoft Foundry)

An AI agent built with **Microsoft Foundry** that answers questions about the history of computing, with a Python Flask web client that talks to it through the OpenAI Responses API.

Built while preparing for **Microsoft AI-103: Azure AI Apps and Agents Developer**.

## What I built
- Created an agent in Microsoft Foundry using a deployed **gpt-5-mini** model
- Wrote a system prompt that keeps the agent focused on computing history
- Added the **web search** tool for up-to-date answers
- Completed the Python client (`agent_client.py`) to call the agent using **Entra ID authentication** (`DefaultAzureCredential`), with no API keys in code
- Kept the conversation history so the agent understands follow-up questions

## Tech stack
Python · Flask · OpenAI Python SDK · Azure Identity · Microsoft Foundry Agent Service

## Run it yourself
1. Create an agent in Microsoft Foundry and copy its **Responses** endpoint
2. Copy `computer-history-client/.env.example` to `.env` and paste in your endpoint
3. Then:
   ```powershell
   cd computer-history-client
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   az login
   python app.py
   ```
4. Open http://127.0.0.1:5000

## Credits
Based on the [Microsoft Learning lab](https://github.com/MicrosoftLearning/mslearn-agent-quickstart) "Develop your first AI agent in Microsoft Foundry", used under the MIT License (see `LICENSE`).