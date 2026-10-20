Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir
If fso.FileExists(scriptDir & "\dist\InvoiceTracker.exe") Then
    WshShell.Run """" & scriptDir & "\dist\InvoiceTracker.exe""", 0, False
Else
    WshShell.Run "python main.py", 0, False
End If
