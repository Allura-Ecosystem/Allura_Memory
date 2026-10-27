import {useRef,useState,type ReactNode} from 'react';
import {AlertDialog} from '@base-ui/react/alert-dialog';
export function Confirm({title,children,confirm,disabled=false,label='Review decision'}:{title:string;children:ReactNode;confirm:()=>Promise<void>;disabled?:boolean;label?:string}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),cancel=useRef<HTMLButtonElement>(null);
 return <AlertDialog.Root open={open} onOpenChange={setOpen}><AlertDialog.Trigger disabled={disabled}>{label}</AlertDialog.Trigger><AlertDialog.Portal><AlertDialog.Backdrop className="backdrop"/><AlertDialog.Popup className="dialog" initialFocus={cancel}><AlertDialog.Title>{title}</AlertDialog.Title><AlertDialog.Description render={<div/>}>{children}</AlertDialog.Description><div className="toolbar"><AlertDialog.Close ref={cancel} disabled={busy}>Cancel</AlertDialog.Close><button disabled={busy||disabled} onClick={()=>{setBusy(true);void confirm().finally(()=>{setBusy(false);setOpen(false);});}}>Confirm decision</button></div></AlertDialog.Popup></AlertDialog.Portal></AlertDialog.Root>;
}
