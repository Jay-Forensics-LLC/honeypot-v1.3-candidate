import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Database, 
  Search, 
  AlertTriangle,
  CheckCircle,
  Table as TableIcon,
  Loader2 
} from "lucide-react";
import { toast } from "sonner";

export default function DatabaseAnalyzer() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState(null);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setResults(null);
    }
  };

  const analyzeDatabase = async () => {
    if (!selectedFile) {
      toast.error("Please select a database file");
      return;
    }

    setAnalyzing(true);
    
    // Simulate analysis (in production, this would call a backend function)
    setTimeout(() => {
      const mockResults = {
        fileSize: (selectedFile.size / 1024).toFixed(2) + " KB",
        fileType: selectedFile.name.split('.').pop().toUpperCase(),
        tables: [
          { name: "users", records: 1523, suspicious: false },
          { name: "transactions", records: 8942, suspicious: true },
          { name: "logs", records: 25641, suspicious: false },
          { name: "sessions", records: 3421, suspicious: true },
        ],
        findings: [
          {
            severity: "high",
            message: "Deleted records detected in transactions table",
            count: 342
          },
          {
            severity: "medium",
            message: "Suspicious session patterns identified",
            count: 89
          },
          {
            severity: "low",
            message: "Orphaned foreign key references found",
            count: 156
          }
        ],
        integrity: {
          status: "compromised",
          score: 67
        }
      };

      setResults(mockResults);
      setAnalyzing(false);
      toast.success("Database analysis complete");
    }, 3000);
  };

  const getSeverityColor = (severity) => {
    switch(severity) {
      case 'high': return 'bg-red-500/20 text-red-400';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400';
      case 'low': return 'bg-blue-500/20 text-blue-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Database className="w-5 h-5" />
            Database Upload
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-white">Select Database File</Label>
            <div className="flex gap-2">
              <Input
                type="file"
                accept=".db,.sqlite,.sqlite3,.sql,.mdb,.accdb"
                onChange={handleFileSelect}
                className="bg-slate-800 border-slate-700 text-white"
              />
              <Button
                onClick={analyzeDatabase}
                disabled={!selectedFile || analyzing}
                className="bg-blue-600 hover:bg-blue-700 min-w-[120px]"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Analyze
                  </>
                )}
              </Button>
            </div>
            {selectedFile && (
              <p className="text-sm text-slate-400">
                Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
              </p>
            )}
          </div>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <p className="text-sm text-blue-200">
              <strong>Supported formats:</strong> SQLite (.db, .sqlite, .sqlite3), SQL dumps (.sql), 
              Microsoft Access (.mdb, .accdb)
            </p>
          </div>
        </CardContent>
      </Card>

      {results && (
        <>
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Analysis Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="bg-slate-800/50 p-4 rounded-lg">
                  <p className="text-slate-400 text-sm mb-1">File Size</p>
                  <p className="text-white text-xl font-semibold">{results.fileSize}</p>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-lg">
                  <p className="text-slate-400 text-sm mb-1">Database Type</p>
                  <p className="text-white text-xl font-semibold">{results.fileType}</p>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-lg">
                  <p className="text-slate-400 text-sm mb-1">Integrity Score</p>
                  <p className={`text-xl font-semibold ${results.integrity.score > 80 ? 'text-green-400' : results.integrity.score > 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {results.integrity.score}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <TableIcon className="w-5 h-5" />
                Tables Discovered
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {results.tables.map((table, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-slate-800/30 rounded border border-slate-700">
                    <div className="flex items-center gap-3">
                      <Database className="w-4 h-4 text-slate-400" />
                      <span className="text-white font-medium">{table.name}</span>
                      <Badge className="bg-slate-700">
                        {table.records.toLocaleString()} records
                      </Badge>
                    </div>
                    {table.suspicious ? (
                      <Badge className="bg-red-500/20 text-red-400">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        Suspicious
                      </Badge>
                    ) : (
                      <Badge className="bg-green-500/20 text-green-400">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Clean
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Forensic Findings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {results.findings.map((finding, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-4 bg-slate-800/30 rounded border border-slate-700">
                    <Badge className={getSeverityColor(finding.severity)}>
                      {finding.severity.toUpperCase()}
                    </Badge>
                    <div className="flex-1">
                      <p className="text-white font-medium">{finding.message}</p>
                      <p className="text-sm text-slate-400 mt-1">
                        {finding.count} instance{finding.count !== 1 ? 's' : ''} detected
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}