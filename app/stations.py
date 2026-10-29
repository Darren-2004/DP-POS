import argparse
import os
from pathlib import Path

from app.main import database_path
from app.print_jobs import PrintJobStore


def main():
    parser = argparse.ArgumentParser(description="Provision a station print agent")
    parser.add_argument("name", nargs="?", help="A human-readable POS station name, e.g. Cashier 1")
    actions = parser.add_mutually_exclusive_group()
    actions.add_argument("--rotate", metavar="STATION", help="Rotate the token for a station name or ID")
    actions.add_argument("--revoke", metavar="STATION", help="Revoke a station name or ID")
    args = parser.parse_args()
    store = PrintJobStore(database_path())
    try:
        if args.rotate:
            station = store.rotate_station_token(args.rotate)
            action = "Rotated"
        elif args.revoke:
            station = store.revoke_station(args.revoke)
            print(f"Revoked station {station['name']} ({station['stationId']})")
            return
        elif args.name:
            station = store.create_station(args.name)
            action = "Created"
        else:
            parser.error("Provide a station name, --rotate STATION, or --revoke STATION")
    except ValueError as error:
        parser.error(str(error))

    print(f"{action} station: {station['name']} ({station['stationId']})")
    print(f"Station ID: {station['stationId']}")
    print(f"Agent token: {station['agentToken']}")
    print("Save the token in that station's agent configuration; it cannot be shown again.")


if __name__ == "__main__":
    main()