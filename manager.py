# manager.py
# A TUI for managing beer pong tournaments via your API.

import os
import sys
import getpass
import requests
from requests.auth import HTTPBasicAuth
from rich.console import Console
from rich.table import Table
import questionary

# --- CONFIGURATION ---
# It's best practice to set these as environment variables.
# Example: export API_URL="https://mybeerpongapi.duckdns.org"
API_URL = os.environ.get("API_URL")
API_USER = os.environ.get("API_USER")
API_PASS = os.environ.get("API_PASS")

# Create a console object for beautiful printing
console = Console()


# --- API CLIENT ---
# A simple class to handle all communication with your server.
class ApiClient:
    def __init__(self, base_url, username, password):
        if not base_url or not username or not password:
            console.print(
                "[bold red]Error: API_URL, API_USER, and API_PASS must be set.[/bold red]"
            )
            sys.exit(1)
        self.base_url = base_url
        self.auth = HTTPBasicAuth(username, password)

    def _request(self, method, endpoint, json=None):
        try:
            response = requests.request(
                method,
                f"{self.base_url}/api/{endpoint}",
                auth=self.auth,
                json=json,
                timeout=10,
            )
            response.raise_for_status()  # Raises an exception for bad status codes (4xx or 5xx)
            if response.status_code == 204:  # No Content (for DELETE)
                return None
            return response.json()
        except requests.exceptions.HTTPError as err:
            console.print(
                f"[bold red]API Error:[/bold red] {err.response.status_code} {err.response.reason}"
            )
            console.print(f"Details: {err.response.text}")
            return None
        except requests.exceptions.RequestException as err:
            console.print(f"[bold red]Connection Error:[/bold red] {err}")
            return None

    def get_tournaments(self):
        return self._request("GET", "tournaments")

    def get_tournament_details(self, tournament_id):
        return self._request("GET", f"tournaments/{tournament_id}")

    def create_tournament(self, data):
        return self._request("POST", "tournaments", json=data)

    def update_tournament(self, tournament_id, data):
        return self._request("PUT", f"tournaments/{tournament_id}", json=data)

    def delete_tournament(self, tournament_id):
        return self._request("DELETE", f"tournaments/{tournament_id}")


# --- TUI FUNCTIONS ---


def get_tournament_form_data(default_data=None):
    """Gets all tournament data from the user via a series of prompts."""
    default_data = default_data or {}

    console.print("\n[bold green]Enter Tournament Details:[/bold green]")

    date = questionary.text(
        "Date (YYYY-MM-DD):", default=default_data.get("date", "")
    ).ask()
    type = questionary.select(
        "Tournament Type:", choices=["single", "team"], default=default_data.get("type")
    ).ask()
    flavor = questionary.text(
        "Flavor Text:", default=default_data.get("flavor", "")
    ).ask()

    # Get participants
    participants = []
    if "participants" in default_data:
        console.print(
            f"Current Participants: {', '.join(default_data['participants'])}"
        )
        if not questionary.confirm("Do you want to re-enter all participants?").ask():
            participants = default_data["participants"]

    if not participants:
        while True:
            participant = questionary.text(
                f"Add participant #{len(participants) + 1} (or press Enter to finish):"
            ).ask()
            if not participant:
                break
            participants.append(participant)

    if not participants:
        console.print("[bold yellow]A tournament must have participants.[/bold yellow]")
        return None

    # Get placements
    placements = {"firstPlace": [], "secondPlace": [], "thirdPlace": []}

    # --- FIX APPLIED HERE ---
    # We get the default list first. If it's empty, we pass None to the 'default' argument.

    first_place_default = default_data.get("placements", {}).get("firstPlace", [])
    placements["firstPlace"] = questionary.checkbox(
        "Select First Place winner(s):",
        choices=participants,
        default=first_place_default if first_place_default else None,
    ).ask()

    second_place_default = default_data.get("placements", {}).get("secondPlace", [])
    placements["secondPlace"] = questionary.checkbox(
        "Select Second Place winner(s):",
        choices=participants,
        default=second_place_default if second_place_default else None,
    ).ask()

    third_place_default = default_data.get("placements", {}).get("thirdPlace", [])
    placements["thirdPlace"] = questionary.checkbox(
        "Select Third Place winner(s):",
        choices=participants,
        default=third_place_default if third_place_default else None,
    ).ask()

    return {
        "date": date,
        "type": type,
        "flavor": flavor,
        "participants": participants,
        "placements": placements,
    }


def add_tournament(client):
    """Handler for adding a new tournament."""
    data = get_tournament_form_data()
    if data:
        result = client.create_tournament(data)
        if result:
            console.print(
                f"\n[bold green]Success![/bold green] Tournament created with ID: {result['tournamentId']}"
            )


def list_tournaments(client):
    """Handler for listing all tournaments in a table."""
    tournaments = client.get_tournaments()
    if tournaments is None:
        return  # Error was already printed

    table = Table(title="All Tournaments")
    table.add_column("ID", style="cyan")
    table.add_column("Date", style="magenta")
    table.add_column("Type", style="green")
    table.add_column("Flavor", style="yellow")
    table.add_column("Participants")

    for t in tournaments:
        table.add_row(
            str(t["id"]),
            t["date"],
            t["type"],
            t["flavor"],
            t.get("participants", "N/A"),
        )

    console.print(table)


def update_tournament(client):
    """Handler for updating an existing tournament."""
    tournaments = client.get_tournaments()
    if not tournaments:
        console.print("[yellow]No tournaments found to update.[/yellow]")
        return

    choice = questionary.select(
        "Which tournament do you want to update?",
        choices=[f"{t['id']}: {t['date']} - {t['flavor']}" for t in tournaments],
    ).ask()

    if not choice:
        return

    tournament_id = int(choice.split(":")[0])
    console.print(
        f"Fetching details for tournament [bold cyan]#{tournament_id}[/bold cyan]..."
    )

    details = client.get_tournament_details(tournament_id)
    if not details:
        return

    new_data = get_tournament_form_data(default_data=details)
    if new_data:
        result = client.update_tournament(tournament_id, new_data)
        if result:
            console.print("\n[bold green]Success![/bold green] Tournament updated.")


def delete_tournament(client):
    """Handler for deleting a tournament."""
    tournaments = client.get_tournaments()
    if not tournaments:
        console.print("[yellow]No tournaments found to delete.[/yellow]")
        return

    choice = questionary.select(
        "Which tournament do you want to delete?",
        choices=[f"{t['id']}: {t['date']} - {t['flavor']}" for t in tournaments],
    ).ask()

    if not choice:
        return

    tournament_id = int(choice.split(":")[0])

    if questionary.confirm(
        f"Are you sure you want to delete tournament #{tournament_id}? This cannot be undone."
    ).ask():
        result = client.delete_tournament(tournament_id)
        # Note: A successful DELETE returns None in our client
        if result is None:
            console.print("\n[bold green]Success![/bold green] Tournament deleted.")


def main():
    """Main function to run the TUI."""
    global API_URL, API_USER, API_PASS

    # Prompt for missing credentials
    if not API_URL:
        API_URL = questionary.text("Enter your API URL:").ask()
    if not API_USER:
        API_USER = questionary.text("Enter your API Username:").ask()
    if not API_PASS:
        API_PASS = getpass.getpass("Enter your API Password: ")

    client = ApiClient(API_URL, API_USER, API_PASS)

    while True:
        console.print("\n" + "=" * 30)
        action = questionary.select(
            "What do you want to do?",
            choices=[
                "List all tournaments",
                "Add a new tournament",
                "Update a tournament",
                "Delete a tournament",
                "Quit",
            ],
        ).ask()

        if action == "List all tournaments":
            list_tournaments(client)
        elif action == "Add a new tournament":
            add_tournament(client)
        elif action == "Update a tournament":
            update_tournament(client)
        elif action == "Delete a tournament":
            delete_tournament(client)
        elif action == "Quit" or action is None:
            break

    console.print("[bold blue]Goodbye![/bold blue]")


if __name__ == "__main__":
    main()

