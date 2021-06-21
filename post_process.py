import git # pip install GitPython
import json


def file_versions(path):
    for commit in reversed(list(git.Repo().iter_commits(paths=path))):
        yield (commit.committed_date, commit.tree[path].data_stream.read())


def build_history():
    history = {}
    for timestamp, contents in file_versions("docs/showsByCinema.json"):
        timestamp_ms = timestamp * 1000
        for cinema, shows in json.loads(contents).items():
            for show in shows:
                if history.get(show["url"]):
                    _, available, reserved = history[show["url"]][-1]
                    if available == show.get("available") and reserved == show.get("reserved"):
                        continue
                else:
                     history[show["url"]] = []
                history[show["url"]].append((timestamp_ms, show.get("available"), show.get("reserved")))
    return history


with open("docs/showHistory.json", "w") as f:
    json.dump(build_history(), f, indent=2)
