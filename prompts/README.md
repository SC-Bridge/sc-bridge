# LLM Prompts

This directory contains prompts used by the SC Bridge's AI analysis features.

## Files

### `analysis.md`
System prompt for AI fleet analysis. This is loaded dynamically when generating fleet insights.

**To customize the analysis:**
1. Edit `analysis.md` with your preferred instructions
2. Restart the SC Bridge server
3. Generate a new AI analysis to see the changes

**Note:** If the file cannot be read, the system will fall back to a default embedded prompt.

## Prompt Guidelines

- Use clear, specific instructions
- Organize with markdown headers and lists
- Specify output format expectations
- Provide context about the use case
- Keep the tone professional

## Future Prompts

Additional prompt files can be added here for other AI features:
- Ship comparison prompts
- Build loadout recommendations
- Organization fleet planning
- CCU chain optimization
