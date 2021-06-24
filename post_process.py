import git # pip install GitPython
import json
import pathlib

def file_versions(path, n):
    for commit in reversed(list(git.Repo().iter_commits(paths=path, max_count=n))):
        yield (commit.committed_date, commit.tree[path].data_stream.read())


def write_history(path):
    pathlib.Path(path).touch(exist_ok=True)
    with open(path) as f:
        history_json = f.read()
        history = json.loads(history_json) if history_json != "" else {}
    for timestamp, contents in file_versions("docs/showsByCinema.json", 10 if history_json != "" else None):
        timestamp_ms = timestamp * 1000
        for cinema, shows in json.loads(contents).items():
            for show in shows:
                reserved, available = show.get("reserved", 0), show.get("available", 0)
                if history.get(show["url"]):
                    previous = history[show["url"]][-1]
                    open_seating = previous[1] == -1 or available == -1
                    if (previous[0] >= timestamp_ms or # already in history
                        (not open_seating and previous[2] == reserved and (previous[1] == available or available > 0)) or # availability didn't change
                        (not open_seating and reserved == 0 and available == 0) or # bad data
                        (open_seating and available == previous[1])): # availability didn't change
                        continue
                else:
                     history[show["url"]] = []
                history[show["url"]].append((timestamp_ms, available, reserved))
    with open(path, "w") as f:
        json.dump(history, f, indent=2)


if __name__ == "__main__":
    write_history("docs/history.json")
