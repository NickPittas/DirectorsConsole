#!/bin/bash
echo "🔍 Verifying WorkflowParser Implementation..."
echo ""

# Check files exist
echo "📁 Checking files..."
files=(
    "models.py"
    "parser.py"
    "test_all_nodes.py"
    "IMPLEMENTATION_COMPLETE.md"
    "NODE_TYPE_REFERENCE.md"
    "SUBAGENT_REPORT.md"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✅ $file"
    else
        echo "  ❌ $file MISSING"
    fi
done

echo ""
echo "🧪 Running comprehensive test..."
python3 test_all_nodes.py 2>&1 | tail -3

echo ""
echo "📊 Checking node type count..."
python3 -c "
import sys
sys.path.insert(0, '.')
from parser import WorkflowParser
parser = WorkflowParser({})
print(f'✅ Parser supports {len(parser.NODE_TYPES)} node types')
"

echo ""
echo "✅ Verification complete!"
