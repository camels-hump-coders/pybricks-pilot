import type { CompilationRequest, CompilationResult } from './pythonCompiler';
import { loadPyodide } from 'pyodide';

// Define Pyodide interface locally since it's not exported
interface PyodideInterface {
  globals: any;
  runPython(code: string): any;
  loadPackage(packages: string | string[]): Promise<void>;
}

interface PythonCompilerModule {
  compile: (code: string, options?: any) => Promise<{ bytecode: Uint8Array; warnings?: string[] }>;
  initialize: () => Promise<void>;
}

let pythonCompiler: PythonCompilerModule | null = null;
let pyodide: PyodideInterface | null = null;

async function initializePythonCompiler(): Promise<PythonCompilerModule> {
  if (pythonCompiler) return pythonCompiler;

  try {
    console.log('Loading Pyodide...');
    
    // Load Pyodide from CDN
    pyodide = await loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.28.1/full/"
    }) as any;
    
    console.log('Pyodide loaded successfully');
    
    // Install any additional packages needed for Pybricks
    try {
      await pyodide!.loadPackage(['setuptools']);
    } catch (e) {
      console.warn('Some packages could not be loaded:', e);
    }
    
    // Set up the compiler environment
    await pyodide!.runPython(`
import sys
import ast
import py_compile
import marshal
import types
import warnings
from io import StringIO

def compile_python_code(source_code, filename='<string>', mode='exec'):
    """
    Compile Python source code and return bytecode with warnings
    """
    warnings_list = []
    
    # Capture warnings
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        
        try:
            # Parse the AST first to check for syntax errors
            parsed = ast.parse(source_code, filename, mode)
            
            # Compile to bytecode
            code_obj = compile(parsed, filename, mode, optimize=0)
            
            # Convert to bytecode
            bytecode = marshal.dumps(code_obj)
            
            # Collect warnings
            for warning in w:
                warnings_list.append(str(warning.message))
                
            return {
                'success': True,
                'bytecode': bytecode,
                'warnings': warnings_list if warnings_list else None
            }
            
        except SyntaxError as e:
            return {
                'success': False,
                'error': f'SyntaxError: {e.msg} (line {e.lineno})'
            }
        except Exception as e:
            return {
                'success': False,
                'error': f'{type(e).__name__}: {str(e)}'
            }

# Make function available globally
globals()['compile_python_code'] = compile_python_code
    `);
    
    pythonCompiler = {
      async initialize() {
        console.log('Pyodide Python compiler initialized');
      },
      
      async compile(code: string, options = {}) {
        if (!pyodide) {
          throw new Error('Pyodide not initialized');
        }
        
        try {
          // Set the source code in Python
          pyodide.globals.set('source_code', code);
          
          // Run the compilation
          const result = pyodide.runPython(`
result = compile_python_code(source_code)
result
          `).toJs();
          
          if (!result.get('success')) {
            throw new Error(result.get('error'));
          }
          
          // Convert Python bytes to JavaScript Uint8Array
          const bytecodeList = result.get('bytecode');
          const bytecode = new Uint8Array(bytecodeList);
          
          const warnings = result.get('warnings');
          
          return {
            bytecode,
            warnings: warnings ? Array.from(warnings) : undefined
          };
          
        } catch (error) {
          throw new Error(`Compilation failed: ${error}`);
        }
      }
    };
    
    await pythonCompiler.initialize();
    return pythonCompiler;
    
  } catch (error) {
    console.warn('Pyodide not available, falling back to mock compiler:', error);
    
    pythonCompiler = {
      async initialize() {
        console.log('Mock Python compiler initialized');
      },
      async compile(code: string, options = {}) {
        return simulateCompilation(code, options);
      }
    };
    
    await pythonCompiler.initialize();
    return pythonCompiler;
  }
}

function simulateCompilation(code: string, options: any = {}) {
  const encoder = new TextEncoder();
  
  // Basic syntax checking
  if (code.includes('syntax error') || code.includes('invalid syntax')) {
    throw new Error('SyntaxError: invalid syntax');
  }
  
  // Check for common import errors
  if (code.includes('import unknown_module')) {
    throw new Error('ImportError: No module named \'unknown_module\'');
  }
  
  // Check for indentation issues
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length > 0) {
      const leadingSpaces = line.length - line.trimStart().length;
      if (leadingSpaces % 4 !== 0 && leadingSpaces > 0) {
        // This is a very basic check - real Python is more complex
        console.warn(`Potential indentation issue on line ${i + 1}`);
      }
    }
  }
  
  const mockBytecode = encoder.encode(`# Compiled Python code\n${code}\n# End of compilation`);
  const warnings = [];
  
  if (code.includes('deprecated')) {
    warnings.push('Warning: Using deprecated function');
  }
  
  if (code.includes('print(') && !code.includes('import')) {
    warnings.push('Consider adding proper imports for better compatibility');
  }
  
  return {
    bytecode: mockBytecode,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

self.onmessage = async (event: MessageEvent<CompilationRequest>) => {
  const request = event.data;
  
  try {
    if (!pythonCompiler) {
      await initializePythonCompiler();
    }
    
    // Now compile is async
    const result = await pythonCompiler!.compile(request.code, request.options);
    
    const response: CompilationResult = {
      id: request.id,
      success: true,
      bytecode: result.bytecode,
      warnings: result.warnings
    };
    
    self.postMessage(response);
  } catch (error) {
    const response: CompilationResult = {
      id: request.id,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
    
    self.postMessage(response);
  }
};