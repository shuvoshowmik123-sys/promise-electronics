import os
import re

def fix_colors(directory):
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith(".dart"):
                path = os.path.join(root, file)
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
                
                # Replace .withValues(alpha: X) with .withOpacity(X)
                # Matches .withValues(alpha: 0.5) or .withValues(alpha:variable)
                new_content = re.sub(r'\.withValues\(\s*alpha:\s*([^)]+)\)', r'.withOpacity(\1)', content)
                
                if content != new_content:
                    print(f"Fixing {path}")
                    with open(path, "w", encoding="utf-8") as f:
                        f.write(new_content)

if __name__ == "__main__":
    fix_colors(r"d:\PromiseIntegratedSystem\PromiseIntegratedSystem\mobile_app_flutter\lib")
