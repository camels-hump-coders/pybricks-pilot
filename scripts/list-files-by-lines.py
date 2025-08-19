#!/usr/bin/env python3

import os
import sys
from pathlib import Path


def count_lines(file_path):
    """Count the number of lines in a file."""
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            return sum(1 for _ in f)
    except:
        return 0


def get_files_with_line_counts(directory):
    """Get all files in directory tree with their line counts."""
    files_data = []

    for root, _, files in os.walk(directory):
        for file in files:
            file_path = os.path.join(root, file)

            # Skip binary files and common non-text files
            if file.endswith(
                (
                    ".pyc",
                    ".pyo",
                    ".so",
                    ".dll",
                    ".exe",
                    ".bin",
                    ".jpg",
                    ".jpeg",
                    ".png",
                    ".gif",
                    ".bmp",
                    ".ico",
                    ".pdf",
                    ".zip",
                    ".tar",
                    ".gz",
                    ".rar",
                    ".7z",
                    ".mp3",
                    ".mp4",
                    ".avi",
                    ".mov",
                    ".wav",
                    ".ttf",
                    ".otf",
                    ".woff",
                    ".woff2",
                    ".eot",
                )
            ):
                continue

            # Skip hidden files and directories
            if (
                "/.git/" in file_path
                or "/node_modules/" in file_path
                or "/.next/" in file_path
            ):
                continue

            line_count = count_lines(file_path)
            if line_count > 0:  # Only include files with content
                relative_path = os.path.relpath(file_path, directory)
                files_data.append((relative_path, line_count))

    return files_data


def main():
    # Get directory from command line or use current directory
    directory = sys.argv[1] if len(sys.argv) > 1 else "."
    directory = os.path.abspath(directory)

    print(f"\nAnalyzing directory: {directory}")
    print("=" * 80)

    # Get all files with line counts
    files_data = get_files_with_line_counts(directory)

    # Sort by line count (descending)
    files_data.sort(key=lambda x: x[1], reverse=True)

    # Display top 20
    print(f"\nTop 20 files by line count:")
    print("-" * 80)
    print(f"{'Lines':<10} {'File Path'}")
    print("-" * 80)

    for i, (file_path, line_count) in enumerate(files_data[:20], 1):
        print(f"{line_count:<10} {file_path}")

    print("-" * 80)
    print(f"Total files analyzed: {len(files_data)}")
    total_lines = sum(count for _, count in files_data)
    print(f"Total lines across all files: {total_lines:,}")


if __name__ == "__main__":
    main()
