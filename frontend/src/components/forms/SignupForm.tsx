function SignupForm({handleSubmit, username, setUsername, password, setPassword}){
    return(
        <form className = "signup" onSubmit={handleSubmit}>
            <h2>Signup</h2>
            <input placeholder="Username" value={username} onChange={e =>
                setUsername(e.target.value)} />
            <input type="password" placeholder="Password" value={password}
                onChange={e => setPassword(e.target.value)} />
            <button type="submit">Signup</button>
        </form>
    )
}
export default SignupForm

