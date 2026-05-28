# HDT Plugin

Build with:

```powershell
dotnet build -c Release /p:HdtAssemblyDir="C:\path\to\HDT"
```

The output DLL belongs in:

```text
%AppData%\HearthstoneDeckTracker\Plugins\HDTBgTracker\
```

The plugin writes logs, SQLite data, and game JSON dumps under `%AppData%\HDTBgTracker\`.

