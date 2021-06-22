import git # pip install GitPython
import json


def file_versions(path, n):
    for commit in reversed(list(git.Repo().iter_commits(paths=path, max_count=n))):
        yield (commit.committed_date, commit.tree[path].data_stream.read())


def write_history(path):
    with open(path) as f:
        history_json = f.read()
        history = json.loads(history_json) if history_json != "" else {}
    for timestamp, contents in file_versions("docs/showsByCinema.json", 10 if history_json != "" else None):
        timestamp_ms = timestamp * 1000
        for cinema, shows in json.loads(contents).items():
            for show in shows:
                if history.get(show["url"]):
                    previous = history[show["url"]][-1]
                    if previous[0] >= timestamp_ms or (previous[1] == show.get("available") and previous[2] == show.get("reserved")):
                        continue
                else:
                     history[show["url"]] = []
                history[show["url"]].append((timestamp_ms, show.get("available"), show.get("reserved")))
    with open(path, "w") as f:
        json.dump(history, f, indent=2)


if __name__ == "__main__":
    write_history("docs/showHistory.json")
